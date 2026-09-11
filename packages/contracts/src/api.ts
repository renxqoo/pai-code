import { z } from 'zod';

import { PermissionRulesSchema } from './permissions';
import { RuntimeSnapshotViewSchema } from './runtime';
import { ProviderModelSchema, ThinkingFormatSchema } from './settings';
import { InflightViewSchema, PendingDialogViewSchema, SubagentSnapshotViewSchema } from './inflight-views';
import { DiffFileViewSchema, SessionViewSchema, SubagentSpawnViewSchema } from './ui-events';
import { IdleRecycleMinutesSchema } from './settings';

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
    /** 消息自身的时间戳（ms）= 事件流的消息身份（message_start/update/end 的 messageId）。
     * 与条目 id 不同源：它是「同一条消息」在转写/在途快照/增量流三处的共用 key。
     * 0 = 该条目缺 message.timestamp（legacy 降级：块身份退回条目 id）。 */
    messageTs: z.number(),
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
        /** task 工具的子代理执行清单；其余工具不携带。 */
        subagents: z.array(SubagentSpawnViewSchema).optional(),
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
  /** 排队中的 steer/follow-up 文本（重载后唯一的读口；无队列后端为两个空数组）。 */
  queue: z.object({ steering: z.array(z.string()), followUp: z.array(z.string()) }),
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
  /** 模型思考能力（新任务页按模型计算可用思考档的数据面；缺省 = 不支持思考）。 */
  reasoning: z.boolean().optional(),
  /** pi models.json thinkingLevelMap 的镜像（键 = 档位，值 null = 该档不支持）。 */
  thinkingLevelMap: z.record(z.string(), z.union([z.string(), z.null()])).optional(),
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

/** 会话内斜杠命令/技能条目（get_commands 收窄；source 四源：hub 三源 + builtin 内置命令）。 */
export const CommandViewSchema = z.object({
  name: z.string(),
  description: z.string().nullable(),
  source: z.enum(['extension', 'prompt', 'skill', 'builtin']),
});
export type CommandView = z.infer<typeof CommandViewSchema>;

/**
 * agent 定义的管理面形态（主进程文件面读写；tools/model 为 null = 不写 frontmatter
 * 字段 = hub 运行期继承语义：模型继承父对话，工具用默认集）。
 * file = 定义文件名主干（hub 只认 frontmatter name，手写文件可与其不等）：枚举结果必带
 * （定位/删除的身份键）；upsert 提交时忽略——服务端恒以 name 为新文件主干（pattern 内）。
 */
export const AgentDefinitionSchema = z
  .object({
    name: z.string().min(1),
    description: z.string(),
    systemPrompt: z.string(),
    tools: z.array(z.string()).nullable(),
    model: z.string().nullable(),
    scope: z.enum(['user', 'project']),
    /** scope=project 时的项目绝对路径（写入门禁：必须是本应用已知项目）。 */
    project: z.string().nullable(),
    file: z.string().optional(),
  })
  .strict();
export type AgentDefinition = z.infer<typeof AgentDefinitionSchema>;

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
  models: z.array(ProviderModelSchema),
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
  hiddenProjects: z.array(z.string()),
  /** worker 闲置自动回收档位（分钟）。 */
  idleRecycleMinutes: IdleRecycleMinutesSchema,
  archivedSessions: z.array(z.string()),
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

/** 本地 git 分支视图（新建任务页分支选择）：非 git 目录 isRepo=false + 空列表（降级不报错）。 */
export const GitBranchesViewSchema = z
  .object({
    isRepo: z.boolean(),
    current: z.string().nullable(),
    branches: z.array(z.string()),
  })
  .strict();
export type GitBranchesView = z.infer<typeof GitBranchesViewSchema>;

// ---------------------------------------------------------------------------
// 运行状态面（T29：监控页快照与其组成视图）
// ---------------------------------------------------------------------------


export { HostInfoViewSchema, WorkerRowViewSchema, ResourceSampleViewSchema, RuntimeEventViewSchema, RuntimeSnapshotViewSchema } from './runtime';
export type { HostInfoView, WorkerRowView, ResourceSampleView, RuntimeEventView, RuntimeSnapshotView } from './runtime';

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
  'session/register': {
    // parked 会话纳管（hub 契约 v0.12）：冷启动表外会话读命令的前置；幂等、零 worker
    params: z.object({ sessionPath: z.string().min(1) }).strict(),
    result: SessionViewSchema,
  },
  'session/stop': {
    // remove：true = 用户关闭（注册表删行）；false = 内部重开链中间步骤（保行，title/trusted 是 resume 补全源）
    params: z.object({ threadId: z.string().min(1), remove: z.boolean() }).strict(),
    result: z.null(),
  },
  'session/listSaved': {
    params: z.object({ cwd: z.string().optional() }).strict(),
    result: z.array(SavedSessionViewSchema),
  },
  'session/prompt': {
    // 纯图消息合法（message 与 images 至少其一非空）：fork 重试带图消息无文本形态
    params: z
      .object({
        threadId: z.string().min(1),
        message: z.string(),
        streamingBehavior: z.enum(['steer', 'followUp']).optional(),
        images: z.array(imagePayload).optional(),
      })
      .strict()
      .refine((params) => params.message.length > 0 || (params.images?.length ?? 0) > 0, {
        message: 'message_or_images_required',
      }),
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
  'session/inflight': {
    params: threadOnly,
    result: InflightViewSchema,
  },
  'session/subagents': {
    params: threadOnly,
    result: z.object({ subagents: z.array(SubagentSnapshotViewSchema) }),
  },
  'session/pendingDialogs': {
    params: threadOnly,
    result: z.object({ dialogs: z.array(PendingDialogViewSchema) }),
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
  'model/list': {
    params: empty,
    result: z.array(ModelInfoViewSchema),
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
  /** 预会话命令目录（新建任务页无 threadId 可寻址）：用户级启用技能以 skill: 条目
   * 预构；extension/prompt/builtin 源依赖会话态，建会话后以 command/list 为准。 */
  'command/preview': {
    params: empty,
    result: z.array(CommandViewSchema),
  },
  /** agent 定义管理枚举（主进程文件面：user 目录 + 已知项目 .pi/agents，含 systemPrompt 原文）。 */
  'agent/definitions': {
    params: empty,
    result: z.array(AgentDefinitionSchema),
  },
  /** agent 定义新建/编辑（previous 给定时含改名与作用域移动：写新文件后删旧文件；键位 file = 旧文件名主干）。 */
  'agent/upsert': {
    params: z
      .object({
        definition: AgentDefinitionSchema,
        previous: z.object({ file: z.string().min(1), scope: z.enum(['user', 'project']), project: z.string().nullable() }).nullable(),
      })
      .strict(),
    result: z.null(),
  },
  /** agent 定义删除（删定义文件；file = 文件名主干，运行中的子代理不受影响）。 */
  'agent/remove': {
    params: z
      .object({ file: z.string().min(1), scope: z.enum(['user', 'project']), project: z.string().nullable() })
      .strict(),
    result: z.null(),
  },
  /** 项目文件搜索（@ 引用数据源；cwd 必须是本应用已知会话目录）。 */
  'file/search': {
    params: z.object({ cwd: z.string().min(1), query: z.string() }).strict(),
    result: z.array(z.string()),
  },
  /**
   * 读取项目文件文本（代码查看器/Markdown 预览数据源）：只读、相对路径、
   * 点前缀段拒绝（与 file/search 枚举面一致，越界 cwd 同为 cwd_forbidden）；
   * size 为磁盘真实字节数，超过读取上限时截断并 truncated=true。
   */
  'file/read': {
    params: z.object({ cwd: z.string().min(1), path: z.string().min(1) }).strict(),
    result: z
      .object({
        content: z.string(),
        truncated: z.boolean(),
        size: z.number().int().nonnegative(),
      })
      .strict(),
  },
  /** 在系统工具中打开已知项目目录（访达/文件管理器、终端、编辑器）；动作落审计。 */
  'shell/open': {
    params: z.object({ cwd: z.string().min(1), target: z.enum(['finder', 'terminal', 'editor']) }).strict(),
    result: z.null(),
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
  /** 本地 git 分支列表（新建任务页分支选择）；非 git 目录返回空形态（不报错）。 */
  'git/branches': {
    params: z.object({ cwd: z.string().min(1) }).strict(),
    result: GitBranchesViewSchema,
  },
  /** 切换分支（create=true 为创建并检出）；cwd 必须是本应用已知项目目录，脏工作区拒绝。 */
  'git/checkout': {
    params: z.object({ cwd: z.string().min(1), branch: z.string().min(1), create: z.boolean().default(false) }).strict(),
    result: z.object({ branch: z.string() }).strict(),
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
        models: z.array(ProviderModelSchema).min(1),
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
  /** 连接探活：主进程直发指定模型的最小完成请求（缺省 = 渠道第一个模型），不经 hub、不落状态。 */
  'provider/test': {
    params: z.object({ name: z.string().min(1), modelId: z.string().min(1).optional() }).strict(),
    result: z.object({ latencyMs: z.number().int().nonnegative() }).strict(),
  },
  /** 运行状态快照（T29 监控页 2s 轮询；host 未构建时安全降级 hostInfo=null）。 */
  'app/runtime': {
    params: empty,
    result: RuntimeSnapshotViewSchema,
  },
  /** 宿主 stderr 尾部（64KB 环；按需拉取不进 2s 快照）。 */
  'app/diagnosticLog': {
    params: empty,
    result: z.object({ stderrTail: z.string() }).strict(),
  },
  /** 闲置回收档位（唯一写路径：settings 持久 + set_idle_retire_ms 运行期生效）。 */
  'app/setIdleRecycle': {
    params: z.object({ minutes: IdleRecycleMinutesSchema }).strict(),
    result: z.object({ minutes: IdleRecycleMinutesSchema }).strict(),
  },
  /** 诊断包导出（userData/diagnostics/<ts>/ 目录 + Finder 定位）。 */
  'app/exportDiagnostics': {
    params: empty,
    result: z.object({ directory: z.string() }).strict(),
  },
  /** 手动回收空闲 worker（thread/retire；会话保留转 parked）。 */
  'session/retire': {
    params: threadOnly,
    result: z.null(),
  },
  /** 强制回收（clear_queue + abort + thread/retire 逐条容错；对失控生成一步到位）。 */
  'session/forceRetire': {
    params: threadOnly,
    result: z.null(),
  },
  /** 常驻开关（registry 持久真相 + hub 表项置位；parked 未纳管先 register）。 */
  'session/setKeepalive': {
    params: z.object({ threadId: z.string().min(1), keepalive: z.boolean() }).strict(),
    result: z.null(),
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
        hiddenProjects: z.array(z.string()).optional(),
        archivedSessions: z.array(z.string()).optional(),
      })
      .strict()
      .refine(
        (value) =>
          value.defaultModel !== undefined ||
          value.onboarded !== undefined ||
          value.projectModels !== undefined ||
          value.pinnedSessions !== undefined ||
          value.trustedDefault !== undefined ||
          value.hiddenProjects !== undefined ||
          value.archivedSessions !== undefined,
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
