import type { RuntimeSnapshotView, SessionStatsView, SessionView, WorkerRowView } from '@paiapp/contracts';

/**
 * 运行状态页行装配（T29）：hub thread/list（进程态真相）× 本地会话视图（标题）
 * × stats（用量快照）× 排队镜像。纯函数——轮询与订阅在 use-runtime-panel。
 */

export interface RuntimeWorkerRow extends WorkerRowView {
  /** 侧栏标题（注册表视图）；hub 表外会话回落 threadId 前缀。 */
  title: string;
  /** 模型展示名（provider/modelId；null = 未知）。 */
  model: string | null;
  stats: SessionStatsView | null;
  /** steering + followUp 深度（渲染层队列镜像，仅 live 准确）。 */
  queueCount: number;
  /** 距自动回收（live ∧ 非常驻 ∧ 非执行中；null = 不适用）。 */
  recycleInMs: number | null;
}

export interface RuntimeRowsInput {
  workers: readonly WorkerRowView[];
  sessions: Readonly<Record<string, SessionView>>;
  statsById: Readonly<Record<string, SessionStatsView>>;
  queueCountOf: (threadId: string) => number;
  /** 生效闲置阈值（hostInfo.limits.idleRetireMs）；null = 未知不显示倒计时。 */
  idleRetireMs: number | null;
}

export function buildRuntimeRows(input: RuntimeRowsInput): RuntimeWorkerRow[] {
  return input.workers.map((worker) => {
    const session = input.sessions[worker.threadId];
    const idleRetireMs = input.idleRetireMs;
    return {
      ...worker,
      title: session?.title ?? fallbackTitle(worker.threadId),
      model: session?.model ?? null,
      stats: input.statsById[worker.threadId] ?? null,
      queueCount: input.queueCountOf(worker.threadId),
      recycleInMs:
        worker.state === 'live' && !worker.keepalive && !worker.isStreaming && idleRetireMs !== null
          ? Math.max(0, idleRetireMs - worker.idleMs)
          : null,
    };
  });
}

function fallbackTitle(threadId: string): string {
  return threadId.length > 12 ? `${threadId.slice(0, 12)}…` : threadId;
}

/** 页面健康灯（T29 §裁决：相位 > 心跳 > 异常线程 > 内存压力）。 */
export function runtimeHealthLevel(snapshot: RuntimeSnapshotView): 'healthy' | 'degraded' | 'failed' {
  if (snapshot.hostPhase === 'failed') return 'failed';
  if (snapshot.hostPhase === null) return 'degraded';
  const heartbeatStale = snapshot.heartbeatAgeMs !== null && snapshot.heartbeatAgeMs > 5_000;
  const deadThreads = snapshot.hostInfo?.threads.dead ?? 0;
  if (snapshot.hostPhase !== 'ready' || heartbeatStale) return 'degraded';
  return deadThreads > 0 ? 'degraded' : 'healthy';
}
