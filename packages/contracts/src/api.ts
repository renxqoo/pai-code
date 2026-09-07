import { z } from 'zod';

import type { SessionView } from './ui-events';
import { DiffFileViewSchema } from './ui-events';

/**
 * 渲染层 API 面：方法名用应用语义（渲染层不出现协议字面量）。
 * 主进程 api 服务按本表校验参数并翻译为 pai-cli 命令；
 * 传输层统一应答 {ok:true,data} | {ok:false,reason}（ApiOutcome）。
 */

// ---------------------------------------------------------------------------
// 视图形状（adapter 从协议响应收窄而来，渲染层唯一认识的形态）
// ---------------------------------------------------------------------------

/** 历史条目（session/messages 的正规化结果，渲染层水化为对话流）。 */
export const HistoryItemSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('user'),
    id: z.string(),
    text: z.string(),
    origin: z.enum(['user', 'system']),
  }),
  z.object({
    kind: z.literal('assistant'),
    id: z.string(),
    text: z.string(),
    thinking: z.string(),
    toolCalls: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        argsPreview: z.string(),
        output: z.string(),
        isError: z.boolean(),
        /** 文件修改类工具的变更视图；null = 非文件修改。 */
        diff: z.array(DiffFileViewSchema).nullable(),
      }),
    ),
    usage: z.object({ input: z.number(), output: z.number() }).nullable(),
  }),
  z.object({
    kind: z.literal('bash'),
    id: z.string(),
    command: z.string(),
    output: z.string(),
    exitCode: z.number(),
    cancelled: z.boolean(),
  }),
]);
export type HistoryItem = z.infer<typeof HistoryItemSchema>;

export const ThreadStateViewSchema = z.object({
  model: z.object({ provider: z.string(), modelId: z.string() }).nullable(),
  thinkingLevel: z.string().nullable(),
  isStreaming: z.boolean(),
  isCompacting: z.boolean(),
  sessionName: z.string().nullable(),
  messageCount: z.number().int(),
});
export type ThreadStateView = z.infer<typeof ThreadStateViewSchema>;

export const SessionStatsViewSchema = z.object({
  userMessages: z.number().int(),
  assistantMessages: z.number().int(),
  toolCalls: z.number().int(),
  tokensTotal: z.number(),
  cost: z.number(),
  /** null = 上下文占用未知。 */
  contextUsage: z.number().nullable(),
});
export type SessionStatsView = z.infer<typeof SessionStatsViewSchema>;

export const ModelInfoViewSchema = z.object({
  provider: z.string(),
  modelId: z.string(),
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

export const ThinkingLevelViewSchema = z.object({
  current: z.string(),
  allowed: z.array(z.string()),
});
export type ThinkingLevelView = z.infer<typeof ThinkingLevelViewSchema>;

export const CredentialViewSchema = z.object({
  provider: z.string(),
  type: z.string(),
});
export type CredentialView = z.infer<typeof CredentialViewSchema>;

export const ProviderConfigViewSchema = z.object({
  name: z.string(),
  baseUrl: z.string(),
  api: z.string(),
  models: z.array(z.string()),
  /** key 永不回传，只回传有无。 */
  hasKey: z.boolean(),
});
export type ProviderConfigView = z.infer<typeof ProviderConfigViewSchema>;

export const BootstrapViewSchema = z.object({
  sessions: z.custom<SessionView>(),
  saved: z.array(SavedSessionViewSchema),
  models: z.array(ModelInfoViewSchema),
  providers: z.array(ProviderConfigViewSchema),
});
export type BootstrapView = z.infer<typeof BootstrapViewSchema>;

// ---------------------------------------------------------------------------
// 方法 schema（单一真相）：api 服务端做参数校验，渲染层类型从此推导
// ---------------------------------------------------------------------------

const empty = z.object({}).strict();
const threadOnly = z.object({ threadId: z.string().min(1) }).strict();
const threadAndMessage = z.object({ threadId: z.string().min(1), message: z.string().min(1) }).strict();

export const ApiSchemas = {
  'app/bootstrap': {
    params: empty,
    result: BootstrapViewSchema,
  },
  'session/start': {
    params: z
      .object({
        cwd: z.string().min(1),
        provider: z.string().optional(),
        modelId: z.string().optional(),
      })
      .strict(),
    result: z.custom<SessionView>(),
  },
  'session/resume': {
    params: z.object({ sessionPath: z.string().min(1) }).strict(),
    result: z.custom<SessionView>(),
  },
  'session/stop': {
    params: threadOnly,
    result: z.null(),
  },
  'session/listSaved': {
    params: z.object({ cwd: z.string().optional() }).strict(),
    result: z.array(SavedSessionViewSchema),
  },
  'session/prompt': {
    params: z
      .object({
        threadId: z.string().min(1),
        message: z.string().min(1),
        streamingBehavior: z.enum(['steer', 'followUp']).optional(),
      })
      .strict(),
    result: z.null(),
  },
  'session/steer': {
    params: threadAndMessage,
    result: z.null(),
  },
  'session/followUp': {
    params: threadAndMessage,
    result: z.null(),
  },
  'session/abort': {
    params: threadOnly,
    result: z.null(),
  },
  'session/entries': {
    params: z.object({ threadId: z.string().min(1), since: z.string().optional() }).strict(),
    result: z.object({
      items: z.array(HistoryItemSchema),
      /** 已消费到的最后条目 id（下一次 since 游标）；null = 尚无条目。 */
      cursor: z.string().nullable(),
    }),
  },
  'session/state': {
    params: threadOnly,
    result: ThreadStateViewSchema,
  },
  'session/stats': {
    params: threadOnly,
    result: SessionStatsViewSchema,
  },
  'session/setName': {
    params: z.object({ threadId: z.string().min(1), name: z.string().min(1) }).strict(),
    result: z.null(),
  },
  'session/setModel': {
    params: z.object({ threadId: z.string().min(1), provider: z.string().min(1), modelId: z.string().min(1) }).strict(),
    result: z.null(),
  },
  'session/setThinking': {
    params: z.object({ threadId: z.string().min(1), level: z.string().min(1) }).strict(),
    result: z.null(),
  },
  'session/thinkingLevels': {
    params: threadOnly,
    result: ThinkingLevelViewSchema,
  },
  'session/compact': {
    params: threadOnly,
    result: z.null(),
  },
  'model/list': {
    params: empty,
    result: z.array(ModelInfoViewSchema),
  },
  'auth/list': {
    params: empty,
    result: z.array(CredentialViewSchema),
  },
  'auth/setKey': {
    params: z.object({ provider: z.string().min(1), apiKey: z.string().min(1) }).strict(),
    result: z.null(),
  },
  'auth/removeKey': {
    params: z.object({ provider: z.string().min(1) }).strict(),
    result: z.null(),
  },
  'dialog/respond': {
    params: z
      .object({
        requestId: z.string().min(1),
        payload: z.record(z.string(), z.unknown()),
      })
      .strict(),
    result: z.null(),
  },
  'subagent/steer': {
    params: z
      .object({ threadId: z.string().min(1), subagentId: z.string().min(1), message: z.string().min(1) })
      .strict(),
    result: z.null(),
  },
  'provider/upsert': {
    params: z
      .object({
        name: z.string().min(1),
        baseUrl: z.string().min(1),
        api: z.string().min(1),
        models: z.array(z.string().min(1)).min(1),
        /** 省略 = 保留既有 key。 */
        apiKey: z.string().optional(),
      })
      .strict(),
    result: z.array(ProviderConfigViewSchema),
  },
  'provider/remove': {
    params: z.object({ name: z.string().min(1) }).strict(),
    result: z.array(ProviderConfigViewSchema),
  },
} as const;

export type ApiMethod = keyof typeof ApiSchemas;
export const API_METHODS = Object.keys(ApiSchemas) as readonly ApiMethod[];

/** 渲染层调用参数/结果类型推导入口。 */
export type ApiParams<M extends ApiMethod> = z.infer<(typeof ApiSchemas)[M]['params']>;
export type ApiData<M extends ApiMethod> = z.infer<(typeof ApiSchemas)[M]['result']>;

/** 传输层统一应答形态（preload 返回值；主进程对 hub 失败做 reason 包装）。 */
export type ApiOutcome<M extends ApiMethod> = { ok: true; data: ApiData<M> } | { ok: false; reason: string };
