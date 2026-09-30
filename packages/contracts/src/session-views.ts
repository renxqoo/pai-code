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

/** tokenAnalytics 视图：占用构成的两个**静态分量**（会话内近似不变——系统提示词含
 *  技能段、工具 schema；技能/项目指令变更时才动）。
 *
 *  只承载展示层无法自行得知的静态分量：**占用与窗口不在这里**——占用走事件流
 *  （assistant/message 实报 usage，每 step 推进）、窗口走模型目录（get_models 的
 *  contextWindow，模型本体属性）。messages 也不提供：它是「占用 − 两估」的残差，
 *  两估之和超实报时会被钳成 0（旧「已用 5.6% / 消息 0%」自相矛盾的成因），
 *  改由展示层从实报占用实时派生，三行天然满足求和恒等式。 */
export const TokenAnalyticsViewSchema = z.object({
  systemPrompt: z.number(),
  tools: z.number(),
});
export type TokenAnalyticsView = z.infer<typeof TokenAnalyticsViewSchema>;

export const ModelInfoViewSchema = z.object({
  provider: z.string(),
  modelId: z.string(),
  /** 模型思考能力（app 渠道配置 join 而来；预设条目缺省 = 未知）。 */
  reasoning: z.boolean().optional(),
  /** 上下文窗口（hub 目录已解析值：模型级 > 档案级）。**本体属性**——窗口是
   *  「模型」的函数，不是会话运行时的观测，故随目录下发（展示层分母的唯一来源）；
   *  缺省 = 目录未声明，展示层按无分母不渲染百分比。 */
  contextWindow: z.number().optional(),
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
