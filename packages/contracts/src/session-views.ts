/**
 * 会话域视图 schema（T43 自 api.ts 拆出——max-lines 500 纪律）：thread 状态/
 * 会话统计/上下文分析/思考档/命令条目/模型目录/历史会话行的 zod 形状。
 * ApiSchemas（api.ts）按引用消费；index 经 export * 对外单点。
 */
import { z } from 'zod';

import { queueEntry } from './queue-views';

export const ThreadStateViewSchema = z.object({
  model: z.object({ provider: z.string(), model: z.string() }).nullable(),
  isStreaming: z.boolean(),
  isCompacting: z.boolean(),
  sessionName: z.string().nullable(),
  messageCount: z.number().int(),
  /** 排队中的 steer/follow-up 条目（entry id + 文本——id 是单条队列命令的寻址键；
   *  重载后唯一的读口；无队列后端为两个空数组）。 */
  queue: z.object({ steering: z.array(queueEntry), followUp: z.array(queueEntry) }),
});
export type ThreadStateView = z.infer<typeof ThreadStateViewSchema>;
export const SessionStatsViewSchema = z.object({
  userMessages: z.number().int(),
  assistantMessages: z.number().int(),
  toolCalls: z.number().int(),
  toolResults: z.number().int(),
  tokens: z.object({ input: z.number(), output: z.number(), total: z.number() }),
  cost: z.number(),
});
export type SessionStatsView = z.infer<typeof SessionStatsViewSchema>;

/** tokenAnalytics 视图（T43）：上下文占用展示就绪派生（used=total 活线程≈实报输入侧；
 *  utilizationPct 取整主指标；构成分项为估算口径——与实报占用分开命名）。 */
export const TokenAnalyticsViewSchema = z.object({
  used: z.number(),
  window: z.number(),
  utilizationPct: z.number().int(),
  remaining: z.number(),
  systemPrompt: z.number(),
  tools: z.number(),
  messages: z.number(),
  cacheHitRate: z.number(),
  totalCacheRead: z.number(),
  totalCacheWrite: z.number(),
  sessionOutput: z.number(),
});
export type TokenAnalyticsView = z.infer<typeof TokenAnalyticsViewSchema>;

export const ModelInfoViewSchema = z.object({
  provider: z.string(),
  modelId: z.string(),
  /** 模型思考能力（app 渠道配置 join 而来；预设条目缺省 = 未知）。 */
  reasoning: z.boolean().optional(),
  /** 目录来源（preset = hub 内置预设；custom = app 写入的渠道模型）。 */
  source: z.enum(['preset', 'custom']).optional(),
});
export type ModelInfoView = z.infer<typeof ModelInfoViewSchema>;

export const SavedSessionViewSchema = z.object({
  sessionPath: z.string(),
  sessionId: z.string(),
  cwd: z.string(),
  name: z.string().nullable(),
  modifiedAt: z.number(),
  messageCount: z.number().int(),
  firstMessage: z.string(),
});
export type SavedSessionView = z.infer<typeof SavedSessionViewSchema>;

/** 会话思考档读口（get_thinking_level：当前值 + 生效层级；无值态归一 off/source off）。 */
export const ThinkingLevelViewSchema = z.object({
  level: z.string(),
  source: z.enum(['session', 'project', 'user', 'off']),
});
export type ThinkingLevelView = z.infer<typeof ThinkingLevelViewSchema>;

/** 会话内斜杠命令/技能条目（get_commands 收窄；source 两源：command=机器拦截斜杠动词、skill=模型分发面）。 */
export const CommandViewSchema = z.object({
  name: z.string(),
  description: z.string().nullable(),
  source: z.enum(['command', 'skill']),
});
export type CommandView = z.infer<typeof CommandViewSchema>;
