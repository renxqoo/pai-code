import type { RuntimeSnapshotView } from '@paiapp/contracts';

import { copy } from '@/strings';

/**
 * 运行状态页的展示格式化与派生（纯函数）：字节/时长/时钟、资源采样 → 图表点位、
 * 摘要文本、worker 筛选。装配与交互在 runtime-screen 及其分区组件。
 */

const KIB = 1024;
const MIB = 1024 * KIB;
const SECOND = 1000;
const MINUTE = 60 * SECOND;

/** 字节展示：— / KB / MB / GB（null = 该来源当次不可得）。 */
export function formatBytes(bytes: number | null): string {
  if (bytes === null || !Number.isFinite(bytes) || bytes < 0) return '—';
  if (bytes < MIB) return `${Math.max(1, Math.round(bytes / KIB))} KB`;
  const mib = bytes / MIB;
  if (mib < 1024) return `${mib < 100 ? mib.toFixed(1) : Math.round(mib)} MB`;
  return `${(mib / 1024).toFixed(1)} GB`;
}

/** 运行时长：秒 → 分秒 → 时分（≥1 天含天），垃圾输入降级 0s。 */
export function formatUptime(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms) || ms <= 0) return '0s';
  const totalSeconds = Math.floor(ms / SECOND);
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m ${seconds}s`;
}

/** MB 数值轴/读数文本（资源图表进程系列）。 */
export function formatMegabytes(value: number): string {
  if (!Number.isFinite(value)) return '0 MB';
  return value >= 100 ? `${Math.round(value)} MB` : `${value.toFixed(1)} MB`;
}

/** GB 数值文本（资源图表系统内存系列）。 */
export function formatGigabytes(value: number): string {
  if (!Number.isFinite(value)) return '0 GB';
  return `${value.toFixed(1)} GB`;
}

export type ResourceChartPoint = {
  at: number;
  app: number | null;
  hub: number | null;
  workers: number | null;
  system: number | null;
};

/** 采样环 → 图表点位：进程内存取 MB，系统内存取「总量 − 可用」的 GB 值；null 保持断点。 */
export function toResourceChartPoints(history: ReadonlyArray<RuntimeSnapshotView['history'][number]>): ResourceChartPoint[] {
  return history.map((sample) => ({
    at: sample.at,
    app: sample.appRssBytes === null ? null : sample.appRssBytes / MIB,
    hub: sample.hubRssBytes === null ? null : sample.hubRssBytes / MIB,
    workers: sample.workersRssBytes === null ? null : sample.workersRssBytes / MIB,
    system:
      sample.systemTotalBytes === null || sample.systemAvailableBytes === null
        ? null
        : (sample.systemTotalBytes - sample.systemAvailableBytes) / (1024 * MIB),
  }));
}

/** 系统内存压力（0-1，已用占比）；样本缺失时 null 不渲染压力条。 */
export function systemMemoryPressure(latest: RuntimeSnapshotView['latest']): number | null {
  const total = latest?.systemTotalBytes ?? null;
  const available = latest?.systemAvailableBytes ?? null;
  if (total === null || available === null || total <= 0) return null;
  return Math.min(1, Math.max(0, (total - available) / total));
}

/** 三段进程内存的合计与占比（三段全缺时 null，不渲染分段条）。 */
export function processMemorySegments(latest: RuntimeSnapshotView['latest']): { total: number; app: number; hub: number; workers: number } | null {
  if (latest === null) return null;
  const app = latest.appRssBytes ?? 0;
  const hub = latest.hubRssBytes ?? 0;
  const workers = latest.workersRssBytes ?? 0;
  const total = app + hub + workers;
  if (total <= 0) return null;
  return { total, app, hub, workers };
}

export type RuntimeHealthTone = 'healthy' | 'degraded' | 'failed';

/** 健康灯文案（健康灯判定单一真相在 runtime-entries 的 runtimeHealthLevel）。 */
export function healthLabel(level: RuntimeHealthTone): string {
  if (level === 'healthy') return copy.runtime.healthHealthy;
  if (level === 'degraded') return copy.runtime.healthDegraded;
  return copy.runtime.healthFailed;
}

/** 宿主相位展示名（null = 宿主从未构建）。 */
export function phaseLabel(phase: RuntimeSnapshotView['hostPhase']): string {
  if (phase === 'ready') return copy.runtime.phaseReady;
  if (phase === 'restarting') return copy.runtime.phaseRestarting;
  if (phase === 'failed') return copy.runtime.phaseFailed;
  if (phase === 'starting') return copy.runtime.phaseStarting;
  return copy.runtime.phaseFailed;
}

/** 心跳展示值：age 取秒级整数，null = 从未收到。 */
export function heartbeatLabel(heartbeatAgeMs: number | null): string {
  if (heartbeatAgeMs === null) return copy.runtime.heartbeatNever;
  return copy.runtime.heartbeatAgo(Math.max(0, Math.round(heartbeatAgeMs / SECOND)));
}

/** 空闲时长展示：分钟向下取整（不足 1 分钟显 0）。 */
export function idleLabel(idleMs: number): string {
  return copy.runtime.idleFor(Math.max(0, Math.floor(idleMs / MINUTE)));
}

/** 回收倒计时展示：向上取整到秒，超期窗口显示 0。 */
export function recycleCountdownLabel(recycleInMs: number): string {
  return copy.runtime.recycleIn(Math.max(0, Math.ceil(recycleInMs / SECOND)));
}

/** 摘要文本（剪贴板）：版本/相位/心跳/重启/线程计数/workers 数。 */
export function buildSummaryText(snapshot: RuntimeSnapshotView): string {
  const lines: string[] = [
    copy.runtime.summaryTitle,
    `Pai ${snapshot.appVersion}`,
    `${copy.runtime.hostPhase}: ${phaseLabel(snapshot.hostPhase)}`,
    `${copy.runtime.heartbeat}: ${heartbeatLabel(snapshot.heartbeatAgeMs)}`,
    `${copy.runtime.restarts}: ${snapshot.restarts.count}`,
    `${copy.runtime.capacity}: ${summaryThreads(snapshot)}`,
    `${copy.runtime.workersTitle}: ${snapshot.workers.length}`,
  ];
  const host = snapshot.hostInfo;
  if (host !== null) lines.push(`Hub ${host.version} · ${copy.runtime.bunLabel} ${host.bunVersion}`);
  return lines.join('\n');
}

function summaryThreads(snapshot: RuntimeSnapshotView): string {
  const threads = snapshot.hostInfo?.threads;
  if (threads === undefined) return `${snapshot.workers.length}`;
  return copy.runtime.summaryThreads(threads.live, threads.parked, threads.dead);
}

export type WorkerRowFilter = 'all' | 'executing' | 'idle' | 'parked' | 'dead';

/** 表头筛选谓词：执行中 = live 且流式；空闲 = live 非流式（常驻仍属 live 桶）。 */
export function matchesWorkerFilter(filter: WorkerRowFilter, row: { state: string; isStreaming: boolean }): boolean {
  if (filter === 'all') return true;
  if (filter === 'executing') return row.state === 'live' && row.isStreaming;
  if (filter === 'idle') return row.state === 'live' && !row.isStreaming;
  return row.state === filter;
}

/** 可回收的空闲 worker 行（live、非流式、无常驻）：回收全部空闲按钮的数据源。 */
export function isRecyclableIdle(row: { state: string; isStreaming: boolean; keepalive: boolean }): boolean {
  return row.state === 'live' && !row.isStreaming && !row.keepalive;
}
