import { z } from 'zod';

import { SubagentSpawnViewSchema } from './ui-events';

/**
 * 收敛读口视图（get_inflight / get_subagents / get_pending_dialogs）。
 * 设计见任务文档 T35：在途内容只存在于宿主内存，读口是刷新/重连后唯一的收敛来源。
 */

/** 在途工具调用的流式输出尾部（get_inflight.toolOutputs）。 */
export const InflightToolViewSchema = z.object({
  callId: z.string(),
  output: z.string(),
  /** 宿主丢头保尾：true = 这是尾部片段而非全文。 */
  truncated: z.boolean(),
  /** 调用开始时刻（epoch ms）：重载后恢复时长显示的唯一来源。 */
  startedAt: z.number(),
});
export type InflightToolView = z.infer<typeof InflightToolViewSchema>;

/** 直执行 bash 的在途面（get_inflight.bash）。 */
export const InflightBashViewSchema = z.object({
  id: z.string(),
  command: z.string(),
  startedAt: z.number(),
});
export type InflightBashView = z.infer<typeof InflightBashViewSchema>;

/** 在途 assistant 消息（尚未落盘的那半段）：与流式增量同源形状的正规化视图。 */
export const InflightMessageViewSchema = z.object({
  /** 消息身份（= 事件流 messageId，块 id 同源）。 */
  messageTs: z.number(),
  text: z.string(),
  thinking: z.string(),
  /** 已发出但结果未落的工具调用（无 output/exitCode/diff 面）。 */
  toolCalls: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      argsPreview: z.string(),
      subagents: z.array(SubagentSpawnViewSchema).optional(),
    }),
  ),
});
export type InflightMessageView = z.infer<typeof InflightMessageViewSchema>;

/** get_inflight 的完整视图：本轮尚未落盘的全部事实。 */
export const InflightViewSchema = z.object({
  /** 本轮持久前缀边界（turn/start 时刻的 WAL seq；与 get_entries 游标同域）；null = 无在途轮。 */
  turnStartSeq: z.number().nullable(),
  /** 本轮开始时刻（epoch ms，与边界同一时刻采集）：刷新后轮计时取它，不从刷新时刻重新起算。 */
  turnStartedAt: z.number().nullable(),
  message: InflightMessageViewSchema.nullable(),
  toolOutputs: z.array(InflightToolViewSchema),
  bash: InflightBashViewSchema.nullable(),
});
export type InflightView = z.infer<typeof InflightViewSchema>;

/** get_subagents 的视图（manager 全量表快照；无子代理为空数组）。 */
export const SubagentSnapshotViewSchema = z.object({
  agentId: z.string(),
  agentName: z.string(),
  /** 任务描述（manager work 字段）。 */
  work: z.string(),
  status: z.enum(['busy', 'idle', 'on-disk']),
  runId: z.number(),
  sessionId: z.string(),
  agentType: z.string().optional(),
});
export type SubagentSnapshotView = z.infer<typeof SubagentSnapshotViewSchema>;

/** get_pending_dialogs 的视图：与 ui_request 帧同字段（可复用同一弹窗正规化）。 */
export const PendingDialogViewSchema = z.object({
  requestId: z.string(),
  threadId: z.string(),
  method: z.string(),
  payload: z.record(z.string(), z.unknown()),
});
export type PendingDialogView = z.infer<typeof PendingDialogViewSchema>;
