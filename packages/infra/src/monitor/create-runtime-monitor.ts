import { hostInfoView, parseDiagnosticEvent, threadListRows, type HubApi } from '@paiapp/api';
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
import { createSampleRing } from './sample-ring';
import { createSupervisionLog } from './supervision-log';

/**
 * 运行状态监控器（T29）：2s 单定时器轮询 host 本地观测面（thread/list +
 * get_host_info 经 hub 门面，零 worker 唤醒）+ Electron/os 资源采样 + 心跳帧资源折叠，
 * 组装 app/runtime 快照。hub 挂死时快照仍可用（缓存旧值 + 相位真相）。
 */

const DEFAULT_INTERVAL_MS = 2_000;
const DEFAULT_HISTORY_LIMIT = 900;
const DEFAULT_EVENT_LIMIT = 200;
const SNAPSHOT_MAX_HISTORY = 180;
const SNAPSHOT_MAX_EVENTS = 50;
/** 心跳新鲜窗：超过视为宿主资源数据停更（1Hz 心跳的 3 个周期）。 */
const HEARTBEAT_FRESH_MS = 3_000;

export interface RuntimeMonitorDeps {
  /** host 未构建（装配失败/未启动）返回 null——监控器降级运行（poll 前置守卫与
   *  diagnostics 快照源：hostPhase/restarts 来自 port 面，非命令面）。 */
  host: () => HostProcessPort | null;
  /** hub 门面 accessor（get_host_info/thread/list 两命令的调用面；未装配返回 null
   *  ——命令跳过、样本照推，缓存旧值语义同 hub 挂死）。 */
  hub: () => HubApi | null;
  /** Electron 自身足迹（app.getAppMetrics 聚合）。 */
  appMetrics(): { rssBytes: number | null; cpuPercent: number | null };
  systemMemory(): { totalBytes: number | null; availableBytes: number | null };
  idleRecycleMinutes(): IdleRecycleMinutes;
  appVersion(): string;
  intervalMs?: number;
  historyLimit?: number;
  eventLimit?: number;
  /** 时钟注入缝（测试用）；缺省 Date.now。 */
  now?: () => number;
  /** 每次成功轮询后交付 hub 线程表（消费方做状态漂移纠正/keepalive 对账）。 */
  onWorkersPolled?(rows: readonly WorkerRowView[]): void;
}

interface HeartbeatState {
  at: number;
  rssBytes: number | null;
  cpuPercent: number | null;
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
  noteWorkerRecycled(threadId: string, reason: 'idle' | 'manual' | 'rss'): void;
  /** thread_died 帧：worker 异常死亡进时间线。 */
  noteWorkerDied(threadId: string, reason: string): void;
  snapshot(): RuntimeSnapshotView;
}

export function createRuntimeMonitor(deps: RuntimeMonitorDeps): RuntimeMonitor {
  const intervalMs = deps.intervalMs ?? DEFAULT_INTERVAL_MS;
  const now = deps.now ?? Date.now;
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
    // 心跳超龄（宿主挂死/重启窗口）不再把死进程资源当现势值——样本记 null，
    // 图表呈断点而非「平稳假象」；hostInfo.rssBytes 仍由快照独立呈现
    const heartbeatFresh = heartbeat !== null && now() - heartbeat.at <= HEARTBEAT_FRESH_MS;
    samples.push({
      at: now(),
      appRssBytes: app.rssBytes,
      appCpuPercent: app.cpuPercent,
      hubRssBytes: heartbeatFresh ? heartbeat?.rssBytes ?? null : null,
      hubCpuPercent: heartbeatFresh ? heartbeat?.cpuPercent ?? null : null,
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
        const hub = deps.hub();
        const [infoOutcome, listOutcome] =
          hub === null ? [null, null] : await Promise.all([hub.host.info(), hub.thread.list()]);
        if (infoOutcome?.ok) hostInfo = hostInfoView(infoOutcome.data);
        if (listOutcome?.ok) workers = threadListRows(listOutcome.data);
        // workers 证据只在 thread/list 成功时投递——半成功（仅 host_info）投递的
        // 是上一轮缓存行，会被漂移纠正误读为现势
        if (listOutcome?.ok) deps.onWorkersPolled?.([...workers]);
        pushSample();
      } finally {
        polling = false;
      }
    },
    noteHeartbeat(frame: HeartbeatFrame): void {
      heartbeat = {
        at: now(),
        rssBytes: frame.rssBytes ?? null,
        cpuPercent: frame.cpuPercent ?? null,
      };
    },
    noteHostPhase(phase: HostPhase): void {
      events.record({
        at: now(),
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
      events.record({ at: now(), level: 'info', kind: 'worker_recycled', detail: `${threadId} (${reason})` });
    },
    noteWorkerDied(threadId: string, reason: string): void {
      events.record({ at: now(), level: 'error', kind: 'worker_died', detail: `${threadId}: ${reason}` });
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
        heartbeatAgeMs: heartbeat === null ? null : Math.max(0, now() - heartbeat.at),
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
