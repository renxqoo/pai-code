import type {
  AgentDefinition,
  ApiOutcome,
  CommandView,
  ImagePayload,
  PermissionRules,
  PreferencesView,
  ProviderModel,
  SkillView,
  ThinkingFormat,
} from '@paiapp/contracts';

import type { RuntimeController } from './runtime-controller';

/**
 * 控制器对外契约（从 live-controller.ts 拆出，一文件一事）：
 * 渲染层唯一的数据/动作入口面——组件只依赖它，不感知 IPC 与协议。
 */

/** 新会话入参（渲染层动作面形状）：思考档与权限模式在 thread/start 成功后后置应用。 */
export type CreateSessionInput = {
  cwd: string
  trusted?: boolean
  model?: { provider: string; modelId: string }
  thinkingLevel?: string
  permissionMode?: PermissionRules['mode']
}

/** 会话创建结果：成功带新 threadId（调用方据此把首条消息/草稿寻址到新会话）。 */
export type CreateSessionOutcome = { ok: true; threadId: string } | { ok: false; reason: string };

export interface LiveController {
  readonly start: () => Promise<void>;
  readonly dispose: () => void;
  /** 发送：成功返回 null，失败返回原因（调用方转用户可见提示）。mode 显式指定生成中投递方式。 */
  readonly submitDraft: (
    threadId: string,
    message: string,
    images?: readonly ImagePayload[],
    mode?: 'auto' | 'steer' | 'followUp',
  ) => Promise<string | null>;
  /** 会话选择：一律直接激活（parked 只读浏览，历史经 host 直读水化——T27 读不唤醒）。 */
  readonly selectSession: (threadId: string) => void;
  readonly stopActiveTurn: (threadId: string) => Promise<void>;
  readonly createSession: (input: CreateSessionInput) => Promise<CreateSessionOutcome>;
  readonly openSavedSession: (sessionPath: string, trusted?: boolean) => Promise<boolean>;
  /** 会话信任切换 = stop(await) → 同文件 resume(trusted) → 激活新 threadId；stop 失败即中止不动原会话。 */
  readonly reloadSessionTrusted: (threadId: string, trusted: boolean) => Promise<boolean>;
  readonly closeSession: (threadId: string) => Promise<void>;
  readonly renameSession: (threadId: string, name: string) => Promise<boolean>;
  readonly respondDialog: (requestId: string, payload: Record<string, unknown>) => Promise<void>;
  readonly cancelDialog: (requestId: string) => Promise<void>;
  readonly selectModel: (threadId: string, provider: string, modelId: string) => Promise<void>;
  readonly selectThinking: (threadId: string, level: string) => Promise<void>;
  readonly refreshSaved: () => Promise<void>;
  /** 模型目录刷新（provider 保存触发 host 重启后向导/设置页手动补拉）。 */
  readonly refreshModels: () => Promise<void>;
  /** 全局权限规则读取（agentDir/permission-rules.json 视图；成功后同步刷新活跃会话生效视图；失败返回 null）。 */
  readonly refreshPermissionRules: () => Promise<PermissionRules | null>;
  /** 全局权限规则写入（原子写，hub 热读即时生效；成功后同步刷新活跃会话生效视图）；成功返回 null，失败返回原因。 */
  readonly writePermissionRules: (rules: PermissionRules) => Promise<string | null>;
  /** 向运行中子代理注入 steer（非 running 一律失败，原因透传）。 */
  readonly steerSubagent: (threadId: string, subagentId: string, message: string) => Promise<string | null>;
  /** 会话级规则（sidecar）读取；source=thread 表示存在独立规则。 */
  readonly readSessionRules: (threadId: string) => Promise<{ rules: PermissionRules; source: 'thread' | 'global' } | null>;
  /** 会话级规则写入（null = 删除 sidecar 回退全局）；成功返回 null。 */
  readonly writeSessionRules: (threadId: string, rules: PermissionRules | null) => Promise<string | null>;
  readonly restartHost: () => void;
  /** 运行状态方法族（T29：快照/回收/档位/诊断包——runtime-controller.ts）。 */
  readonly runtime: RuntimeController;
  /** 子 agent 定义管理面刷新（主进程文件面快照；失败静默保持旧值）。 */
  readonly refreshAgentDefinitions: () => Promise<void>;
  /** 子 agent 定义新建/编辑/改名/移动（previous 非空时含旧文件清理）；成功返回 null。 */
  readonly upsertAgentDefinition: (definition: AgentDefinition, previous: { file: string; scope: 'user' | 'project'; project: string | null } | null) => Promise<string | null>;
  /** 子 agent 定义删除（删定义文件，file = 文件名主干）；成功返回 null。 */
  readonly removeAgentDefinition: (key: { file: string; scope: 'user' | 'project'; project: string | null }) => Promise<string | null>;
  /** 用户级技能目录刷新（含启用态）。 */
  readonly refreshSkills: () => Promise<void>;
  /** 预会话命令目录（新建任务页 `/` 补全数据源；失败空目录降级）。 */
  readonly fetchCommandPreview: () => Promise<CommandView[]>;
  /** 技能启停：写 pi settings skills overrides；返回写后清单（失败 null + 原因）。 */
  readonly setSkillEnabled: (name: string, enabled: boolean) => Promise<{ ok: true; data: SkillView[] } | { ok: false; reason: string }>;
  /** 技能开关完整编排：写 + 串行重开全部 live 会话（链式排队，交错不叠加）；失败返回重开失败数。 */
  readonly applySkillToggle: (name: string, enabled: boolean) => Promise<{ ok: true; reopenFailures: number } | { ok: false; reason: string }>;
  /** 同文件重开会话（不指定 trusted，保持既有信任态）：技能/资源开关生效通路。 */
  readonly reopenSession: (threadId: string) => Promise<boolean>;
  /** 项目文件搜索（@ 引用；cwd 门禁在主进程，失败返回 null）。 */
  readonly searchFiles: (cwd: string, query: string) => Promise<string[] | null>;
  /** 本地 git 分支列表（新任务页分支选择；非仓库为空形态，失败为 {ok:false}）。 */
  readonly listGitBranches: (cwd: string) => Promise<ApiOutcome<'git/branches'>>;
  readonly listGitGraph: (cwd: string) => Promise<ApiOutcome<'git/graph'>>;
  /** 切换/创建并检出分支（成功返回 {ok:true}；失败原因透传，由调用方转文案）。 */
  readonly checkoutGitBranch: (cwd: string, branch: string, create: boolean) => Promise<ApiOutcome<'git/checkout'>>;
  readonly upsertProvider: (input: { name: string; baseUrl: string; api: string; models: ProviderModel[]; thinkingFormat?: ThinkingFormat; apiKey?: string }) => Promise<boolean>;
  readonly removeProvider: (name: string) => Promise<boolean>;
  /** 应用偏好部分写（返回写后视图；失败返回 null，原因走通知条）。 */
  readonly updatePreferences: (patch: { defaultModel?: string | null; onboarded?: boolean; projectModels?: Record<string, string>; pinnedSessions?: string[]; trustedDefault?: boolean; hiddenProjects?: string[]; archivedSessions?: string[]; hubDev?: { bunPath: string | null; hubEntry: string | null } }) => Promise<PreferencesView | null>;
  /** provider 连接探活（主进程直发；结果原样透传给调用方做内联展示）。 */
  readonly testProvider: (name: string, modelId: string | undefined) => Promise<{ ok: true; latencyMs: number } | { ok: false; reason: string }>;
  /** 直执行 bash（`!` 前缀）：成功返回 null；权威条目经对账进入对话流。 */
  readonly runBash: (threadId: string, command: string) => Promise<string | null>;
  readonly abortBash: (threadId: string) => Promise<void>;
  /** 在系统文件管理器中显示会话文件（主进程白名单校验）。 */
  readonly revealSession: (sessionPath: string) => Promise<void>;
  /** 从历史条目分叉（position=before）→ 旧线程镜像终态 + 激活新会话；失败带原因（cancelled 拦截单列）。 */
  readonly forkSession: (threadId: string, entryId: string) => Promise<{ ok: true; threadId: string } | { ok: false; reason: string }>;
  readonly refreshStats: (threadId: string) => Promise<void>;
  /** 只读水化链（纳管→直读→model 补齐；force 供重试入口越过 hydrated 守卫）。 */
  readonly ensureHydrated: (threadId: string, options?: { force?: boolean }) => Promise<void>;
}
