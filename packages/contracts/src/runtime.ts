/**
 * 运行状态视图形状（T29 app/runtime 数据面）：从 api.ts 拆出保持契约表行数预算；
 * ApiSchemas 的 runtime 方法与此处视图是同一真相的两半（方法表在 api.ts）。
 */
import { z } from 'zod';

import { IdleRecycleMinutesSchema } from './settings';

/** get_host_info 收窄（host-hub v1 形状；垃圾输入在 adapter 降级）。 */
export const HostInfoViewSchema = z.object({
  version: z.string(),
  bunVersion: z.string(),
  pid: z.number().int(),
  uptimeMs: z.number().int().nonnegative(),
  rssBytes: z.number().int().nonnegative(),
  threads: z.object({ live: z.number().int(), parked: z.number().int(), dead: z.number().int() }),
  limits: z.object({
    maxThreads: z.number().int().positive(),
    idleRetireMs: z.number().int().positive(),
    workerStaleMs: z.number().int().positive(),
    workerExitTimeoutMs: z.number().int().positive(),
    rssRetireBytes: z.number().int().nonnegative(),
    bashTimeoutMs: z.number().int().nonnegative(),
  }),
});
export type HostInfoView = z.infer<typeof HostInfoViewSchema>;

/** thread/list 行收窄（worker 表：hub 是进程态真相；host-hub 无 subagents 计数字段——
 *  在途徽标数据源 = agent/status 事件 / get_subagents）。 */
export const WorkerRowViewSchema = z.object({
  threadId: z.string(),
  cwd: z.string(),
  sessionPath: z.string().nullable(),
  state: z.enum(['live', 'parked', 'dead']),
  isStreaming: z.boolean(),
  idleMs: z.number().int().nonnegative(),
  rssBytes: z.number().int().nullable(),
  keepalive: z.boolean(),
});
export type WorkerRowView = z.infer<typeof WorkerRowViewSchema>;

/** 资源采样点（主进程 2s 采样环；null = 该来源当次不可得）。 */
export const ResourceSampleViewSchema = z.object({
  at: z.number().int(),
  appRssBytes: z.number().int().nullable(),
  appCpuPercent: z.number().nullable(),
  hubRssBytes: z.number().int().nullable(),
  hubCpuPercent: z.number().nullable(),
  workersRssBytes: z.number().int().nullable(),
  systemTotalBytes: z.number().int().nullable(),
  systemAvailableBytes: z.number().int().nullable(),
});
export type ResourceSampleView = z.infer<typeof ResourceSampleViewSchema>;

/** 监督事件（主进程内存环 ≤200 条；kind 词表 = 宿主监督面 + worker 生命周期）。 */
export const RuntimeEventViewSchema = z.object({
  at: z.number().int(),
  level: z.enum(['info', 'warn', 'error']),
  kind: z.enum(['host_phase', 'host_restart', 'heartbeat_stale', 'host_exit', 'frame_dropped', 'worker_recycled', 'worker_died', 'spawn_error', 'policy_sync_failed']),
  detail: z.string(),
});
export type RuntimeEventView = z.infer<typeof RuntimeEventViewSchema>;

/** 运行状态快照（app/runtime 2s 轮询；不含 stderr——带宽纪律，按需 app/diagnosticLog）。 */
export const RuntimeSnapshotViewSchema = z.object({
  hostPhase: z.enum(['starting', 'ready', 'restarting', 'failed']).nullable(),
  hostInfo: HostInfoViewSchema.nullable(),
  /** 最近一次宿主心跳距今（ms）；null = 从未收到心跳。 */
  heartbeatAgeMs: z.number().int().nullable(),
  restarts: z.object({ count: z.number().int().nonnegative(), lastCause: z.string().nullable(), lastAt: z.number().int().nullable() }),
  workers: z.array(WorkerRowViewSchema),
  latest: ResourceSampleViewSchema.nullable(),
  /** 近 30 分钟降采样（≤180 点）。 */
  history: z.array(ResourceSampleViewSchema),
  /** 最近监督事件（≤50 条，新在尾）。 */
  events: z.array(RuntimeEventViewSchema),
  idleRecycleMinutes: IdleRecycleMinutesSchema,
  appVersion: z.string(),
});
export type RuntimeSnapshotView = z.infer<typeof RuntimeSnapshotViewSchema>;
