import { hostInfoView, threadListRows } from '@paiapp/adapter';
import type {
  HeartbeatFrame,
  HostInfoView,
  HostPhase,
  HostProcessPort,
  IdleRecycleMinutes,
  ResourceSampleView,
  RuntimeSnapshotView,
  WorkerRowView,
} from '@paiapp/contracts';
import { createSampleRing, createSupervisionLog } from '@paiapp/infra';

import { parseDiagnosticEvent } from './diagnostic-events';

/**
 * 运行状态监控器（T29）：2s 单定时器轮询 host 本地观测面（thread/list +
 * get_host_info，零 worker 唤醒）+ Electron/os 资源采样 + 心跳帧资源折叠，
 * 组装 app/runtime 快照。hub 挂死时快照仍可用（缓存旧值 + 相位真相）。
 */

const DEFAULT_INTERVAL_MS = 2_000;
const DEFAULT_HISTORY_LIMIT = 900;
const DEFAULT_EVENT_LIMIT = 200;
const SNAPSHOT_MAX_HISTORY = 180;
const SNAPSHOT_MAX_EVENTS = 50;

export interface RuntimeMonitorDeps {
  /** host 未构建（装配失败/未启动）返回 null——监控器降级运行。 */
  host: () => HostProcessPort | null;
  /** Electron 自身足迹（app.getAppMetrics 聚合）。 */
  appMetrics(): { rssBytes: number | null; cpuPercent: number | null };
  systemMemory(): { totalBytes: number | null; availableBytes: number | null };
  idleRecycleMinutes(): IdleRecycleMinutes;
  appVersion(): string;
  intervalMs?: number;
  historyLimit?: number;
  eventLimit?: number;
  /** 每次成功轮询后交付 hub 线程表（消费方做状态漂移纠正/keepalive 对账）。 */
  onWorkersPolled?(rows: readonly WorkerRowView[]): void;
}

interface HeartbeatState {
  at: number;
  rssBytes: number | null;
  cpuPercent: number | null;
  subagents: number;
}

export interface RuntimeMonitor {
  start(): void;
  stop(): void;
  /** 手动触发一轮轮询（定时器之外；测试与即时刷新用）。 */
  poll(): Promise<void>;
  noteHeartbeat(frame: HeartbeatFrame): void;
  noteHostPhase(phase: HostPhase): void;
  noteDiagnostic(message: string): void;
  /** thread_parked 帧：worker 收编进时间线（idle=闲置 sweep / manual=手动回收）。 */
  noteWorkerRecycled(threadId: string, reason: 'idle' | 'manual'): void;
  /** thread_died 帧：worker 异常死亡进时间线。 */
  noteWorkerDied(threadId: string, reason: string): void;
  snapshot(): RuntimeSnapshotView;
}

export function createRuntimeMonitor(deps: RuntimeMonitorDeps): RuntimeMonitor {
  const intervalMs = deps.intervalMs ?? DEFAULT_INTERVAL_MS;
  const samples = createSampleRing<ResourceSampleView>(deps.historyLimit ?? DEFAULT_HISTORY_LIMIT);
  const events = createSupervisionLog(deps.eventLimit ?? DEFAULT_EVENT_LIMIT);
  let hostInfo: HostInfoView | null = null;
  let workers: readonly WorkerRowView[] = [];
  let heartbeat: HeartbeatState | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;
  let polling = false;

  const pushSample = (): void => {
    const app = deps.appMetrics();
    const system = deps.systemMemory();
    samples.push({
      at: Date.now(),
      appRssBytes: app.rssBytes,
      appCpuPercent: app.cpuPercent,
      // 心跳是 1Hz 推送（比 2s 轮询新鲜）；get_host_info 的 rss 作无心跳时兜底
      hubRssBytes: heartbeat?.rssBytes ?? hostInfo?.rssBytes ?? null,
      hubCpuPercent: heartbeat?.cpuPercent ?? null,
      workersRssBytes: workers.reduce((total, row) => total + (row.rssBytes ?? 0), 0) || null,
      systemTotalBytes: system.totalBytes,
      systemAvailableBytes: system.availableBytes,
    });
  };

  return {
    start(): void {
      if (timer !== null) return;
      timer = setInterval(() => {
        void this.poll();
      }, intervalMs);
    },
    stop(): void {
      if (timer !== null) {
        clearInterval(timer);
        timer = null;
      }
    },
    async poll(): Promise<void> {
      const host = deps.host();
      if (host === null) return;
      // 重入保护：手动 poll 与定时 tick 交叠时不放大命令量
      if (polling) return;
      polling = true;
      try {
        const [infoOutcome, listOutcome] = await Promise.all([
          host.request({ type: 'get_host_info' }),
          host.request({ type: 'thread/list' }),
        ]);
        if (infoOutcome.ok) hostInfo = hostInfoView(infoOutcome.data);
        if (listOutcome.ok) workers = threadListRows(listOutcome.data);
        if (infoOutcome.ok || listOutcome.ok) deps.onWorkersPolled?.([...workers]);
        pushSample();
      } finally {
        polling = false;
      }
    },
    noteHeartbeat(frame: HeartbeatFrame): void {
      heartbeat = {
        at: Date.now(),
        rssBytes: frame.rssBytes ?? null,
        cpuPercent: frame.cpuPercent ?? null,
        subagents: frame.subagents ?? 0,
      };
    },
    noteHostPhase(phase: HostPhase): void {
      events.record({
        at: Date.now(),
        level: phase === 'failed' ? 'error' : phase === 'restarting' ? 'warn' : 'info',
        kind: 'host_phase',
        detail: phase,
      });
    },
    noteDiagnostic(message: string): void {
      const event = parseDiagnosticEvent(message);
      if (event !== null) events.record(event);
    },
    noteWorkerRecycled(threadId: string, reason: 'idle' | 'manual'): void {
      events.record({ at: Date.now(), level: 'info', kind: 'worker_recycled', detail: `${threadId} (${reason})` });
    },
    noteWorkerDied(threadId: string, reason: string): void {
      events.record({ at: Date.now(), level: 'error', kind: 'worker_died', detail: `${threadId}: ${reason}` });
    },
    snapshot(): RuntimeSnapshotView {
      const host = deps.host();
      const diagnostics = host?.diagnostics() ?? null;
      const all = samples.samples();
      const stride = Math.max(1, Math.ceil(all.length / SNAPSHOT_MAX_HISTORY));
      const history: ResourceSampleView[] = [];
      for (let index = stride - 1; index < all.length; index += stride) {
        history.push(all[index] as ResourceSampleView);
      }
      if (all.length > 0 && history.length > 0 && (history[history.length - 1] as ResourceSampleView) !== (all[all.length - 1] as ResourceSampleView)) {
        history.push(all[all.length - 1] as ResourceSampleView);
      }
      return {
        hostPhase: host?.phase ?? null,
        hostInfo,
        heartbeatAgeMs: heartbeat === null ? null : Math.max(0, Date.now() - heartbeat.at),
        restarts: {
          count: diagnostics?.restartCount ?? 0,
          lastCause: diagnostics?.lastRestartCause ?? null,
          lastAt: diagnostics?.lastRestartAt ?? null,
        },
        workers: [...workers],
        latest: samples.latest(),
        history,
        events: events.list().slice(-SNAPSHOT_MAX_EVENTS),
        idleRecycleMinutes: deps.idleRecycleMinutes(),
        appVersion: deps.appVersion(),
      };
    },
  };
}
