import type { ImagePayload } from './hub-protocol';
import type { PermMode } from './permissions';
import type { ThinkingLevel } from './thinking-levels';

/**
 * host-hub 命令入参形状（60 命令；从 hub-protocol 拆出保持行数预算）。
 * 规格真相源 = x-harness 仓库 src/protocol/commands.ts 与各 handler 实现。
 */

// ============================================================================
// Commands (stdin -> host-hub)
// ============================================================================

export interface ThreadStartCmd {
  type: 'thread/start';
  /** Working directory（hub 经 normalizeCwd 归一）；缺省 = hub 进程 cwd。 */
  cwd?: string;
  /** 裸模型 id（三级消歧）；缺省 = 目录首条。 */
  modelId?: string;
  /** 信任项目级扩展（.x-harness 域：agents、skills、settings）；缺省 false。 */
  trusted?: boolean;
  /** 会话权限模式初值（词表外静默降级）。 */
  permissionMode?: PermMode;
  /** 思考档初值（词表外静默降级；词表内但模型不支持显式拒）。 */
  thinkingLevel?: ThinkingLevel;
}

export interface ThreadResumeCmd {
  type: 'thread/resume';
  /** 会话文件（`<sessionsRoot>/<id>/events.jsonl` 词法围栏）。 */
  sessionPath: string;
  cwd?: string;
  trusted?: boolean;
  permissionMode?: PermMode;
  thinkingLevel?: ThinkingLevel;
}

/** 会话文件纳管为 parked 表项（host 本地、零 worker、幂等）。 */
export interface ThreadRegisterCmd {
  type: 'thread/register';
  sessionPath: string;
  trusted?: boolean;
}

export interface ThreadStopCmd {
  type: 'thread/stop';
  threadId: string;
}

/** 手动闲置收编（表项转 parked，会话文件保留）。 */
export interface ThreadRetireCmd {
  type: 'thread/retire';
  threadId: string;
}

/** 会话删除（host 本地；trash 原子 rename + 血缘级联；幂等）。 */
export interface ThreadDeleteCmd {
  type: 'thread/delete';
  sessionPath: string;
}

/** 表项「免闲置收编」标志（host 本地零 worker；只豁免闲置 sweep；不持久化，fork 不继承）。 */
export interface ThreadSetKeepaliveCmd {
  type: 'thread/set_keepalive';
  threadId: string;
  keepalive: boolean;
}

export interface ThreadListCmd {
  type: 'thread/list';
}

export interface ThreadListSavedCmd {
  type: 'thread/list_saved';
  cwd?: string;
}

export interface PromptCmd {
  type: 'prompt';
  threadId: string;
  message: string;
  /** 受理窗口（hub 判定 pendingSends>0 ∨ streaming）内必填。 */
  streamingBehavior?: 'steer' | 'followUp';
  images?: ImagePayload[];
}

export interface SteerCmd {
  type: 'steer';
  threadId: string;
  message: string;
  images?: ImagePayload[];
}

export interface FollowUpCmd {
  type: 'follow_up';
  threadId: string;
  message: string;
  images?: ImagePayload[];
}

export interface AbortCmd {
  type: 'abort';
  threadId: string;
}

export interface ClearQueueCmd {
  type: 'clear_queue';
  threadId: string;
}

export interface QueueDropCmd {
  type: 'queue/drop';
  threadId: string;
  /** inbox entry id（get_state.queue 投影携带的单条寻址键；与请求回执 id 不同名） */
  entryId: string;
}

export interface QueueSendNowCmd {
  type: 'queue/send_now';
  threadId: string;
  /** inbox entry id（仅 followUp 队列条目可改向当前轮） */
  entryId: string;
}

export interface CompactCmd {
  type: 'compact';
  threadId: string;
  customInstructions?: string;
}

export interface GetStateCmd {
  type: 'get_state';
  threadId: string;
}

export interface GetMessagesCmd {
  type: 'get_messages';
  threadId: string;
}

/** 游标 = WAL seq（整数）；未知 seq 显式失败。 */
export interface GetEntriesCmd {
  type: 'get_entries';
  threadId: string;
  since?: number;
  before?: number;
  limit?: number;
}

export interface GetInflightCmd {
  type: 'get_inflight';
  threadId: string;
}

export interface GetSubagentsCmd {
  type: 'get_subagents';
  threadId: string;
}

export interface GetPendingDialogsCmd {
  type: 'get_pending_dialogs';
  threadId: string;
}

export interface GetTreeCmd {
  type: 'get_tree';
  threadId: string;
}

export interface SetSessionNameCmd {
  type: 'set_session_name';
  threadId: string;
  name: string;
}

export interface GetSessionStatsCmd {
  type: 'get_session_stats';
  threadId: string;
}

export interface GetTokenAnalyticsCmd {
  type: 'get_token_analytics';
  threadId: string;
}

export interface GetCommandsCmd {
  type: 'get_commands';
  threadId: string;
}

export interface GetForkMessagesCmd {
  type: 'get_fork_messages';
  threadId: string;
}

/** 会话分叉（seq 域：WAL 行号）；流式中拒绝（thread is streaming，先 abort）。 */
export interface ForkCmd {
  type: 'fork';
  threadId: string;
  seq: number;
  position?: 'before' | 'at';
}

export interface CloneCmd {
  type: 'clone';
  threadId: string;
}

export interface SetModelCmd {
  type: 'set_model';
  threadId: string;
  provider: string;
  modelId: string;
}

export interface GetModelsCmd {
  type: 'get_models';
}

/** 模型参数覆写（写 models.json modelOverrides + 快照热刷新）。 */
export interface SetModelOverrideCmd {
  type: 'set_model_override';
  provider: string;
  modelId: string;
  contextWindow?: number | null;
  maxTokens?: number | null;
  remove?: boolean;
}

export interface GetHostInfoCmd {
  type: 'get_host_info';
}

export interface SetIdleRetireMsCmd {
  type: 'set_idle_retire_ms';
  value: number;
}

export interface SetRssRetireBytesCmd {
  type: 'set_rss_retire_bytes';
  value: number;
}

export interface SetThinkingLevelCmd {
  type: 'set_thinking_level';
  threadId: string;
  level: ThinkingLevel;
}

/** 读会话思考档（单数；无值态归一 off，按 source 层级回退）。 */
export interface GetThinkingLevelCmd {
  type: 'get_thinking_level';
  threadId: string;
}

/** 会话权限模式（写）。 */
export interface PermissionSetModeCmd {
  type: 'permission/set_mode';
  threadId: string;
  mode: PermMode;
}

/** 会话权限模式（读；source = session|project|user|default）。 */
export interface PermissionGetModeCmd {
  type: 'permission/get_mode';
  threadId: string;
}

export interface AuthListCmd {
  type: 'auth/list';
}

export interface AuthSetApiKeyCmd {
  type: 'auth/set_api_key';
  provider: string;
  apiKey: string;
}

export interface AuthRemoveKeyCmd {
  type: 'auth/remove_key';
  provider: string;
}

export interface BashCmd {
  type: 'bash';
  threadId: string;
  command: string;
  excludeFromContext?: boolean;
  timeoutMs?: number;
  /** 执行 id = 命令关联 id（app 的 request 层自动分配，不可显式指定）。 */
  id?: string;
}

export interface AbortBashCmd {
  type: 'abort_bash';
  threadId: string;
  /** 缺省 = 中止全部在跑（app 侧唯一用法）。 */
  id?: string;
}

export interface UiResponseCmd {
  type: 'ui_response';
  requestId: string;
  /** confirm 应答形态：{ confirmed: boolean }。 */
  payload: Record<string, unknown>;
}

/** 宿主设置读写（键白名单：permission.defaultMode / thinking.default / skills.disabled；带 cwd = 项目级，须已信任）。 */
export interface SettingsGetCmd {
  type: 'settings/get';
  cwd?: string;
}

export interface SettingsSetCmd {
  type: 'settings/set';
  key: string;
  value: unknown;
  cwd?: string;
}

/** 信任工作区登记/枚举（无 cwd = 枚举 {trusted: string[]}）。 */
export interface WorkspaceTrustCmd {
  type: 'workspace/trust';
  cwd?: string;
  trusted?: boolean;
}

export interface ModelsAddCmd {
  type: 'models/add';
  id: string;
  provider: string;
  protocol: 'anthropic' | 'openai';
  baseUrl: string;
  apiKeyEnv?: string;
  contextWindow?: number;
  maxTokens?: number;
  reasoning?: boolean;
  input?: Array<'text' | 'image'>;
  cost?: { input: number; output: number; cacheRead?: number; cacheWrite?: number };
}

export interface ModelsRemoveCmd {
  type: 'models/remove';
  id: string;
}

export interface AgentsListCmd {
  type: 'agents/list';
  threadId?: string;
}

/** agent 类型定义 CRUD（user 级：hub 写 ~/.x-harness/agents/<name>.md；round-trip 复析保证）。 */
export interface AgentsCreateCmd {
  type: 'agents/create';
  /** 非空、不含 `/`、不含换行。 */
  name: string;
  /** 非空单行，且非 `[a-zA-Z-]+:` 字段形态行（frontmatter 注入防线）。 */
  description: string;
  /** 非空正文。 */
  systemPrompt: string;
  /** 裸模型 id（不带 provider 前缀——provider/model 拆开写，防 hub 拨号串线）。 */
  model?: string;
  /** 模型归属渠道（与 model 拆开；缺省 = hub 运行期继承/目录反查）。 */
  provider?: string;
  tools?: string[];
}

export interface AgentsRemoveCmd {
  type: 'agents/remove';
  name: string;
}

export interface SkillsListCmd {
  type: 'skills/list';
  cwd?: string;
}

export interface SkillsSetEnabledCmd {
  type: 'skills/set_enabled';
  name: string;
  enabled: boolean;
  cwd?: string;
}

export interface SkillsRemoveCmd {
  type: 'skills/remove';
  name: string;
}

/**
 * 技能候选形态检查（SKILL-INSTALL §1.2）：对给定技能目录批量判定三态
 * ready/rename/blocked（blocked 携问题码闭集——宿主按码本地化文案）。
 */
export interface SkillsInspectCmd {
  type: 'skills/inspect';
  /** 技能目录绝对路径（SKILL.md 父目录）；1..SKILL_INSPECT_MAX_PATHS。 */
  sourcePaths: string[];
}

/**
 * 技能安装（SKILL-INSTALL §1.3）：全树拷贝到用户技能根下一级；name = 目标名
 * （只改副本的 name 行）；overwrite 显式覆盖（缺省拒 = name_conflict）。
 */
export interface SkillsInstallCmd {
  type: 'skills/install';
  sourcePath: string;
  name?: string;
  overwrite?: boolean;
}

/** 拒注册问题码闭集（镜像 x-harness packages/skill/src/inspect.ts SkillProblem）。 */
export type SkillProblemCode =
  | 'not_found'
  | 'unreadable'
  | 'not_regular_file'
  | 'too_large'
  | 'no_frontmatter'
  | 'frontmatter_not_flat'
  | 'missing_fields';

/** skills/inspect 应答单项（state 判别联合；blocked 只携问题码）。 */
export type SkillInspectedCandidate =
  | { sourcePath: string; state: 'ready'; name: string; description: string }
  | { sourcePath: string; state: 'rename'; name: string; description: string }
  | { sourcePath: string; state: 'blocked'; problem: SkillProblemCode };

/** skills/inspect 应答（结果与入参同序同数）。 */
export type SkillsInspectData = { results: SkillInspectedCandidate[] };

/** skills/install 应答（path = 副本 SKILL.md 绝对路径；skippedEntries = 未复制条目数）。 */
export type SkillsInstallData = { name: string; path: string; skippedEntries: number };

/** 向运行中的子 agent 注入 steer（轮边界投递；非驻留/非 busy 拒绝；寻址键 agentId）。 */
export interface SubagentSteerCmd {
  type: 'subagent/steer';
  threadId: string;
  agentId: string;
  message: string;
}

import type { PluginsListCmd, PluginsInspectCmd, PluginsInstallCmd, PluginsUninstallCmd, PluginsSetEnabledCmd, PluginsRemoveCmd, PluginsHotInstallCmd, PluginsHotUninstallCmd, PluginsTrustedSourceListCmd, PluginsTrustedSourceConfirmCmd, PluginsTrustedSourceRejectCmd } from './plugin-commands';

export type { PluginsListCmd, PluginsInspectCmd, PluginsInstallCmd, PluginsUninstallCmd, PluginsSetEnabledCmd, PluginsRemoveCmd, PluginsHotInstallCmd, PluginsHotUninstallCmd, PluginRow, PluginsListData, PluginInspectedCandidate, PluginsInspectData, PluginsInstallData } from './plugin-commands';

export type HubCommand =
  | (ThreadStartCmd & { id?: string })
  | (ThreadResumeCmd & { id?: string })
  | (ThreadRegisterCmd & { id?: string })
  | (ThreadStopCmd & { id?: string })
  | (ThreadRetireCmd & { id?: string })
  | (ThreadDeleteCmd & { id?: string })
  | (ThreadSetKeepaliveCmd & { id?: string })
  | (ThreadListCmd & { id?: string })
  | (ThreadListSavedCmd & { id?: string })
  | (PromptCmd & { id?: string })
  | (SteerCmd & { id?: string })
  | (FollowUpCmd & { id?: string })
  | (AbortCmd & { id?: string })
  | (ClearQueueCmd & { id?: string })
  | (QueueDropCmd & { id?: string })
  | (QueueSendNowCmd & { id?: string })
  | (CompactCmd & { id?: string })
  | (GetStateCmd & { id?: string })
  | (GetMessagesCmd & { id?: string })
  | (GetEntriesCmd & { id?: string })
  | (GetInflightCmd & { id?: string })
  | (GetSubagentsCmd & { id?: string })
  | (GetPendingDialogsCmd & { id?: string })
  | (GetTreeCmd & { id?: string })
  | (SetSessionNameCmd & { id?: string })
  | (GetSessionStatsCmd & { id?: string })
  | (GetTokenAnalyticsCmd & { id?: string })
  | (GetCommandsCmd & { id?: string })
  | (GetForkMessagesCmd & { id?: string })
  | (ForkCmd & { id?: string })
  | (CloneCmd & { id?: string })
  | (SetModelCmd & { id?: string })
  | (GetModelsCmd & { id?: string })
  | (SetModelOverrideCmd & { id?: string })
  | (GetHostInfoCmd & { id?: string })
  | (SetIdleRetireMsCmd & { id?: string })
  | (SetRssRetireBytesCmd & { id?: string })
  | (SetThinkingLevelCmd & { id?: string })
  | (GetThinkingLevelCmd & { id?: string })
  | (PermissionSetModeCmd & { id?: string })
  | (PermissionGetModeCmd & { id?: string })
  | (AuthListCmd & { id?: string })
  | (AuthSetApiKeyCmd & { id?: string })
  | (AuthRemoveKeyCmd & { id?: string })
  | (BashCmd & { id?: string })
  | (AbortBashCmd & { id?: string })
  | (UiResponseCmd & { id?: string })
  | (SettingsGetCmd & { id?: string })
  | (SettingsSetCmd & { id?: string })
  | (WorkspaceTrustCmd & { id?: string })
  | (ModelsAddCmd & { id?: string })
  | (ModelsRemoveCmd & { id?: string })
  | (AgentsListCmd & { id?: string })
  | (AgentsCreateCmd & { id?: string })
  | (AgentsRemoveCmd & { id?: string })
  | (SkillsListCmd & { id?: string })
  | (SkillsSetEnabledCmd & { id?: string })
  | (SkillsRemoveCmd & { id?: string })
  | (SkillsInspectCmd & { id?: string })
  | (SkillsInstallCmd & { id?: string })
  | (PluginsListCmd & { id?: string })
  | (PluginsInspectCmd & { id?: string })
  | (PluginsInstallCmd & { id?: string })
  | (PluginsUninstallCmd & { id?: string })
  | (PluginsSetEnabledCmd & { id?: string })
  | (PluginsRemoveCmd & { id?: string })
  | (PluginsHotInstallCmd & { id?: string })
  | (PluginsHotUninstallCmd & { id?: string })
  | (PluginsTrustedSourceListCmd & { id?: string })
  | (PluginsTrustedSourceConfirmCmd & { id?: string })
  | (PluginsTrustedSourceRejectCmd & { id?: string })
  | (SubagentSteerCmd & { id?: string });

/** 命令词表（与 host-hub COMMAND_NAMES 对应（app 消费子集 72 条——permission/grant|list_rules|remove_rule 三命令不经 app 面）；测试做封闭断言）。 */
export const HUB_COMMAND_TYPES = [
  'thread/start',
  'thread/resume',
  'thread/register',
  'thread/stop',
  'thread/retire',
  'thread/delete',
  'thread/set_keepalive',
  'thread/list',
  'thread/list_saved',
  'prompt',
  'steer',
  'follow_up',
  'abort',
  'clear_queue',
  'queue/drop',
  'queue/send_now',
  'compact',
  'get_state',
  'get_messages',
  'get_entries',
  'get_inflight',
  'get_subagents',
  'get_pending_dialogs',
  'get_tree',
  'set_session_name',
  'get_session_stats',
  'get_token_analytics',
  'get_commands',
  'get_fork_messages',
  'fork',
  'clone',
  'set_model',
  'get_models',
  'set_model_override',
  'get_host_info',
  'set_idle_retire_ms',
  'set_rss_retire_bytes',
  'set_thinking_level',
  'get_thinking_level',
  'permission/set_mode',
  'permission/get_mode',
  'auth/list',
  'auth/set_api_key',
  'auth/remove_key',
  'bash',
  'abort_bash',
  'ui_response',
  'settings/get',
  'settings/set',
  'workspace/trust',
  'models/add',
  'models/remove',
  'agents/list',
  'agents/create',
  'agents/remove',
  'skills/inspect',
  'skills/list',
  'skills/install',
  'skills/set_enabled',
  'skills/remove',
  'plugins/list',
  'plugins/inspect',
  'plugins/install',
  'plugins/uninstall',
  'plugins/set_enabled',
  'plugins/remove',
  'plugins/hot_install',
  'plugins/hot_uninstall',
  'plugins/trusted_source/list',
  'plugins/trusted_source/confirm',
  'plugins/trusted_source/reject',
  'subagent/steer',
] as const;


// 编译期封闭断言：命令词表与类型联合双向绑定（漏登记即编译失败）。
type CoversUnion<T, U extends T> = [T] extends [U] ? unknown : never;
const _hubCommandsCover = null as unknown as CoversUnion<HubCommand['type'], (typeof HUB_COMMAND_TYPES)[number]>;
void _hubCommandsCover;
