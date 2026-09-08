import { z } from 'zod';

import { PermissionRulesSchema } from './permissions';
import { ThinkingFormatSchema } from './settings';
import { DiffFileViewSchema, SessionViewSchema } from './ui-events';

/**
 * 渲染层 API 面：方法名用应用语义（渲染层不出现协议字面量）。
 * 主进程 api 服务按本表校验参数并翻译为 pai-cli 命令；
 * 传输层统一应答 {ok:true,data} | {ok:false,reason}（ApiOutcome）。
 */

// ---------------------------------------------------------------------------
// 视图形状（adapter 从协议响应收窄而来，渲染层唯一认识的形态）
// ---------------------------------------------------------------------------

/** 图片载荷（发送与历史条目共用形状；data 为无前缀 base64）。 */
const imagePayload = z
  .object({
    type: z.literal('image'),
    data: z.string().min(1),
    mimeType: z.string().min(1),
  })
  .strict();

/** 历史条目（session/messages 的正规化结果，渲染层水化为对话流）。 */
export const HistoryItemSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('user'),
    id: z.string(),
    text: z.string(),
    origin: z.enum(['user', 'system']),
    /** 用户消息携带的图片附件（data URL 渲染缩略图）。 */
    images: z.array(imagePayload),
    /** 条目时刻（ms）：轮次计时行与排序用。 */
    at: z.number(),
  }),
  z.object({
    kind: z.literal('assistant'),
    id: z.string(),
    text: z.string(),
    thinking: z.string(),
    at: z.number(),
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
    /** 异常终态（hub stopReason 收窄）；null = 正常结束（stop/toolUse）。 */
    stopReason: z.enum(['error', 'aborted']).nullable(),
    /** stopReason=error 时的上游原始错误信息（如 401 文本）；其余 null。 */
    errorMessage: z.string().nullable(),
  }),
  z.object({
    kind: z.literal('bash'),
    id: z.string(),
    command: z.string(),
    output: z.string(),
    exitCode: z.number(),
    cancelled: z.boolean(),
    at: z.number(),
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
  /** 上下文占用（0-1 比率；null = 未知，如压缩后尚未收到新响应）。 */
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

/** 可用思考档位（协议 get_thinking_levels 仅返回 levels；当前值走 get_state.thinkingLevel）。 */
export const ThinkingLevelViewSchema = z.object({
  allowed: z.array(z.string()),
});
export type ThinkingLevelView = z.infer<typeof ThinkingLevelViewSchema>;

export const CredentialViewSchema = z.object({
  provider: z.string(),
  type: z.string(),
});
export type CredentialView = z.infer<typeof CredentialViewSchema>;

/** 会话内斜杠命令/技能条目（get_commands 收窄；source 三源）。 */
export const CommandViewSchema = z.object({
  name: z.string(),
  description: z.string().nullable(),
  source: z.enum(['extension', 'prompt', 'skill']),
});
export type CommandView = z.infer<typeof CommandViewSchema>;

/** agent 定义条目（agents/list 收窄；project 级仅受信会话可见）。 */
export const AgentViewSchema = z.object({
  name: z.string(),
  description: z.string(),
  source: z.enum(['user', 'project']),
  tools: z.array(z.string()).nullable(),
  model: z.string().nullable(),
});
export type AgentView = z.infer<typeof AgentViewSchema>;

/** 用户级技能视图（skills/list 与 skills/setEnabled 共用形态）。 */
export const SkillViewSchema = z
  .object({
    name: z.string(),
    description: z.string().nullable(),
    enabled: z.boolean(),
    /** agent = agentDir/skills；agents = ~/.agents/skills */
    origin: z.enum(['agent', 'agents']),
  })
  .strict();
export type SkillView = z.infer<typeof SkillViewSchema>;

export const ProviderConfigViewSchema = z.object({
  name: z.string(),
  baseUrl: z.string(),
  api: z.string(),
  models: z.array(z.object({ id: z.string(), reasoning: z.boolean(), vision: z.boolean() }).strict()),
  /** 思考参数形态（default = 不写 compat）。 */
  thinkingFormat: ThinkingFormatSchema,
  /** key 永不回传，只回传有无。 */
  hasKey: z.boolean(),
});
export type ProviderConfigView = z.infer<typeof ProviderConfigViewSchema>;

/** 应用偏好（settings.json 的渲染层视图子集）。 */
export const PreferencesViewSchema = z.object({
  defaultModel: z.string().nullable(),
  onboarded: z.boolean(),
  projectModels: z.record(z.string(), z.string()),
  pinnedSessions: z.array(z.string()),
  trustedDefault: z.boolean(),
});
export type PreferencesView = z.infer<typeof PreferencesViewSchema>;

export const BootstrapViewSchema = z.object({
  sessions: z.array(SessionViewSchema),
  saved: z.array(SavedSessionViewSchema),
  models: z.array(ModelInfoViewSchema),
  providers: z.array(ProviderConfigViewSchema),
  preferences: PreferencesViewSchema,
  /** 启动时 host 相位快照；null = host 从未构建（路径未解析/装配失败），模型与会话能力不可用。 */
  hostPhase: z.enum(['starting', 'ready', 'restarting', 'failed']).nullable(),
});
export type BootstrapView = z.infer<typeof BootstrapViewSchema>;

// ---------------------------------------------------------------------------
// 方法 schema（单一真相）：api 服务端做参数校验，渲染层类型从此推导
// ---------------------------------------------------------------------------

const empty = z.object({}).strict();
const threadOnly = z.object({ threadId: z.string().min(1) }).strict();

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
        trusted: z.boolean().optional(),
      })
      .strict(),
    result: SessionViewSchema,
  },
  'session/resume': {
    params: z.object({ sessionPath: z.string().min(1), trusted: z.boolean().optional() }).strict(),
    result: SessionViewSchema,
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
        images: z.array(imagePayload).optional(),
      })
      .strict(),
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
  'command/list': {
    params: z.object({ threadId: z.string().min(1) }).strict(),
    result: z.array(CommandViewSchema),
  },
  /** agent 定义枚举（host 级；带 threadId 时含该会话受信可见的项目级）。 */
  'agent/list': {
    params: z.object({ threadId: z.string().min(1).optional() }).strict(),
    result: z.array(AgentViewSchema),
  },
  /** 项目文件搜索（@ 引用数据源；cwd 必须是本应用已知会话目录）。 */
  'file/search': {
    params: z.object({ cwd: z.string().min(1), query: z.string() }).strict(),
    result: z.array(z.string()),
  },
  /** 从历史条目分叉（position before|at，默认 before）→ 新会话视图。 */
  'session/fork': {
    params: z.object({ threadId: z.string().min(1), entryId: z.string().min(1), position: z.enum(['before', 'at']).optional() }).strict(),
    result: SessionViewSchema,
  },
  /** 在系统文件管理器中显示会话文件（路径白名单同 resume）。 */
  'session/reveal': {
    params: z.object({ sessionPath: z.string().min(1) }).strict(),
    result: z.null(),
  },
  /** 系统目录选择对话框（单选，可新建）；null = 用户取消。 */
  'dialog/pickDirectory': {
    params: z.object({ defaultPath: z.string().min(1).optional() }).strict(),
    result: z.string().nullable(),
  },
  /** 用户级技能目录（含启用态；启停真相 = agentDir/settings.json 的 skills overrides）。 */
  'skills/list': {
    params: empty,
    result: z.array(SkillViewSchema),
  },
  /** 技能启用/禁用（写 pi settings skills overrides；结果为写后的完整清单）。 */
  'skills/setEnabled': {
    params: z.object({ name: z.string().min(1), enabled: z.boolean() }).strict(),
    result: z.array(SkillViewSchema),
  },
  /** 清空排队消息（协议仅全清，无单条操作）。 */
  'session/clearQueue': {
    params: threadOnly,
    result: z.null(),
  },
  /** 直执行 shell（hub 侧走同一权限门；结果在 response，流式经 bashOutput 事件）。 */
  'session/bash': {
    params: z.object({ threadId: z.string().min(1), command: z.string().min(1) }).strict(),
    result: z.null(),
  },
  'session/abortBash': {
    params: threadOnly,
    result: z.null(),
  },
  /** 全局权限规则（agentDir/permission-rules.json，hub 热读）。 */
  'permission/read': {
    params: empty,
    result: PermissionRulesSchema,
  },
  'permission/write': {
    params: z.object({ rules: PermissionRulesSchema }).strict(),
    result: PermissionRulesSchema,
  },
  /** 会话级规则（sidecar）：读取返回生效规则与来源；写 null = 删除 sidecar 回退全局。 */
  'permission/sessionRead': {
    params: z.object({ threadId: z.string().min(1) }).strict(),
    result: z.object({ rules: PermissionRulesSchema, source: z.enum(['thread', 'global']) }).strict(),
  },
  'permission/sessionWrite': {
    params: z.object({ threadId: z.string().min(1), rules: PermissionRulesSchema.nullable() }).strict(),
    result: z.null(),
  },
  'provider/upsert': {
    params: z
      .object({
        name: z.string().min(1),
        baseUrl: z.string().min(1),
        api: z.string().min(1),
        models: z.array(z.object({ id: z.string().min(1), reasoning: z.boolean(), vision: z.boolean() }).strict()).min(1),
        thinkingFormat: ThinkingFormatSchema.optional(),
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
  /** 连接探活：主进程直发 OpenAI 兼容 1-token 请求，不经 hub、不落状态。 */
  'provider/test': {
    params: z.object({ name: z.string().min(1) }).strict(),
    result: z.object({ latencyMs: z.number().int().nonnegative() }).strict(),
  },
  /** 运行时诊断（M1）：host 相位/stderr 尾部/注册表会话数。 */
  'app/diagnostics': {
    params: empty,
    result: z
      .object({
        hostPhase: z.enum(['starting', 'ready', 'restarting', 'failed']).nullable(),
        stderrTail: z.string(),
        registrySessions: z.number().int().nonnegative(),
      })
      .strict(),
  },
  /** 手动重启 host（走既有 restart 链路；审计落账）。 */
  'app/restartHost': {
    params: empty,
    result: z.null(),
  },
  /** 应用偏好部分写（至少一个字段；结果为写后的完整偏好视图）。 */
  'app/setPreference': {
    params: z
      .object({
        defaultModel: z.string().nullable().optional(),
        onboarded: z.boolean().optional(),
        projectModels: z.record(z.string(), z.string()).optional(),
        pinnedSessions: z.array(z.string()).optional(),
        trustedDefault: z.boolean().optional(),
      })
      .strict()
      .refine(
        (value) =>
          value.defaultModel !== undefined ||
          value.onboarded !== undefined ||
          value.projectModels !== undefined ||
          value.pinnedSessions !== undefined ||
          value.trustedDefault !== undefined,
        { message: 'empty_preference' },
      ),
    result: PreferencesViewSchema,
  },
} as const;

export type ApiMethod = keyof typeof ApiSchemas;
export const API_METHODS = Object.keys(ApiSchemas) as readonly ApiMethod[];

/** 渲染层调用参数/结果类型推导入口。 */
export type ApiParams<M extends ApiMethod> = z.infer<(typeof ApiSchemas)[M]['params']>;
export type ApiData<M extends ApiMethod> = z.infer<(typeof ApiSchemas)[M]['result']>;

/** 传输层统一应答形态（preload 返回值；主进程对 hub 失败做 reason 包装）。 */
export type ApiOutcome<M extends ApiMethod> = { ok: true; data: ApiData<M> } | { ok: false; reason: string };
