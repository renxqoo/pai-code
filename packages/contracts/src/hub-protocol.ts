/**
 * pai-cli 协议镜像（v0.5）。
 *
 * 同步纪律：本文件是外部仓库 pai-cli `src/protocol.ts` 的镜像抄录，
 * 不引入对 pai-cli 的运行时依赖。协议变更时，先走 pai-cli 仓库流程定稿，
 * 再在同一提交内更新本文件与 `__test__` 的词表断言。
 *
 * 差异说明：pai-cli 侧 `EventFrame.event` 的负载类型来自 pi SDK
 * （AgentSessionEvent），本镜像以结构化宽松类型代替，字段收窄在 adapter 完成。
 */

/** pi SDK AgentSessionEvent 的宽松镜像：字段收窄由 adapter 负责。 */
export type AgentSessionEvent = { type: string } & Record<string, unknown>;

export interface ImagePayload {
  type: 'image';
  data: string;
  mimeType: string;
}

// ============================================================================
// Commands (stdin -> pai-cli)
// ============================================================================

export interface ThreadStartCmd {
  type: 'thread/start';
  /** Working directory for the conversation. Defaults to the pai-cli process cwd. */
  cwd?: string;
  /** Initial model. Requires both provider and modelId. */
  provider?: string;
  modelId?: string;
  /** Trust project-local `.pi` extensions. Defaults to false. */
  trusted?: boolean;
}

export interface ThreadResumeCmd {
  type: 'thread/resume';
  /** Session file to resume. */
  sessionPath: string;
  cwd?: string;
  trusted?: boolean;
}

export interface ThreadStopCmd {
  type: 'thread/stop';
  threadId: string;
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
  /** Required when the thread is already streaming: "steer" or "followUp". */
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

export interface SetModelCmd {
  type: 'set_model';
  threadId: string;
  provider: string;
  modelId: string;
}

export interface GetModelsCmd {
  type: 'get_models';
}

export interface SetThinkingLevelCmd {
  type: 'set_thinking_level';
  threadId: string;
  level: 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max';
}

export interface GetThinkingLevelsCmd {
  type: 'get_thinking_levels';
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

export interface GetEntriesCmd {
  type: 'get_entries';
  threadId: string;
  since?: string;
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

export interface ClearQueueCmd {
  type: 'clear_queue';
  threadId: string;
}

export interface ForkCmd {
  type: 'fork';
  threadId: string;
  entryId: string;
  position?: 'before' | 'at';
}

export interface CloneCmd {
  type: 'clone';
  threadId: string;
}

export interface NavigateTreeCmd {
  type: 'navigate_tree';
  threadId: string;
  targetId: string;
  summarize?: boolean;
  customInstructions?: string;
  replaceInstructions?: boolean;
  label?: string;
}

export interface GetForkMessagesCmd {
  type: 'get_fork_messages';
  threadId: string;
}

export interface GetCommandsCmd {
  type: 'get_commands';
  threadId: string;
}

export interface BashCmd {
  type: 'bash';
  threadId: string;
  command: string;
  excludeFromContext?: boolean;
}

export interface AbortBashCmd {
  type: 'abort_bash';
  threadId: string;
}

export interface UiResponseCmd {
  type: 'ui_response';
  /** Must match the requestId of the dialog request. */
  requestId: string;
  /** e.g. { confirmed: true }, { value: "Allow" }, { cancelled: true } */
  payload: Record<string, unknown>;
}

/** v0.5：每对话独立权限规则（host 本地命令，纯文件操作不唤醒 worker）。 */
export interface GetPermissionRulesCmd {
  type: 'get_permission_rules';
  threadId: string;
}

/** `rules: null` 删除 sidecar，回退全局规则文件。 */
export interface SetPermissionRulesCmd {
  type: 'set_permission_rules';
  threadId: string;
  rules: Record<string, unknown> | null;
}

/** v0.5：agent 定义枚举（host 本地命令）。 */
export interface AgentsListCmd {
  type: 'agents/list';
  threadId?: string;
}

/** v0.5：向运行中的后台子 agent 注入 steer（非 running 一律失败）。 */
export interface SubagentSteerCmd {
  type: 'subagent/steer';
  threadId: string;
  subagentId: string;
  message: string;
}

export type HubCommand =
  | (ThreadStartCmd & { id?: string })
  | (ThreadResumeCmd & { id?: string })
  | (ThreadStopCmd & { id?: string })
  | (ThreadListCmd & { id?: string })
  | (ThreadListSavedCmd & { id?: string })
  | (PromptCmd & { id?: string })
  | (SteerCmd & { id?: string })
  | (FollowUpCmd & { id?: string })
  | (AbortCmd & { id?: string })
  | (CompactCmd & { id?: string })
  | (GetStateCmd & { id?: string })
  | (GetMessagesCmd & { id?: string })
  | (SetModelCmd & { id?: string })
  | (GetModelsCmd & { id?: string })
  | (SetThinkingLevelCmd & { id?: string })
  | (GetThinkingLevelsCmd & { id?: string })
  | (AuthListCmd & { id?: string })
  | (AuthSetApiKeyCmd & { id?: string })
  | (AuthRemoveKeyCmd & { id?: string })
  | (GetEntriesCmd & { id?: string })
  | (GetTreeCmd & { id?: string })
  | (SetSessionNameCmd & { id?: string })
  | (GetSessionStatsCmd & { id?: string })
  | (ClearQueueCmd & { id?: string })
  | (ForkCmd & { id?: string })
  | (CloneCmd & { id?: string })
  | (NavigateTreeCmd & { id?: string })
  | (GetForkMessagesCmd & { id?: string })
  | (GetCommandsCmd & { id?: string })
  | (BashCmd & { id?: string })
  | (AbortBashCmd & { id?: string })
  | (UiResponseCmd & { id?: string })
  | (GetPermissionRulesCmd & { id?: string })
  | (SetPermissionRulesCmd & { id?: string })
  | (AgentsListCmd & { id?: string })
  | (SubagentSteerCmd & { id?: string });

/** 命令词表（与 pai-cli 一侧逐一对应；测试做封闭断言）。 */
export const HUB_COMMAND_TYPES = [
  'thread/start',
  'thread/resume',
  'thread/stop',
  'thread/list',
  'thread/list_saved',
  'prompt',
  'steer',
  'follow_up',
  'abort',
  'compact',
  'get_state',
  'get_messages',
  'set_model',
  'get_models',
  'set_thinking_level',
  'get_thinking_levels',
  'auth/list',
  'auth/set_api_key',
  'auth/remove_key',
  'get_entries',
  'get_tree',
  'set_session_name',
  'get_session_stats',
  'clear_queue',
  'fork',
  'clone',
  'navigate_tree',
  'get_fork_messages',
  'get_commands',
  'bash',
  'abort_bash',
  'ui_response',
  'get_permission_rules',
  'set_permission_rules',
  'agents/list',
  'subagent/steer',
] as const;

// ============================================================================
// Frames (stdout <- pai-cli)
// ============================================================================

export interface ResponseFrame {
  type: 'response';
  id?: string;
  command: string;
  success: boolean;
  data?: unknown;
  error?: string;
}

export interface EventFrame {
  type: 'event';
  threadId: string;
  event: AgentSessionEvent;
}

export interface UiRequestFrame {
  type: 'ui_request';
  requestId: string;
  threadId: string;
  /** Dialog method: "confirm" | "select" | "input" | "editor" | "notify" | "setStatus" */
  method?: string;
  /** v0.5：对话框由该对话的子 agent 中继时标识其身份。 */
  subagentId?: string;
  /** v0.5：中继对话框的子 agent 名。 */
  agent?: string;
  [key: string]: unknown;
}

/** host 心跳 1Hz；有任何子 agent 在途时带聚合计数（queued+running）。 */
export interface HeartbeatFrame {
  type: 'heartbeat';
  subagents?: number;
}

export interface HubErrorFrame {
  type: 'hub_error';
  /** worker 内异常时标识线程。 */
  threadId?: string;
  scope: string;
  error: string;
}

/** v0.4：worker 异常死亡；线程表转 dead，下条命令自动恢复。 */
export interface ThreadDiedFrame {
  type: 'thread_died';
  threadId: string;
  reason: string;
}

/** v0.5：子 agent（孙进程）会话事件原样转发，按 subagentId 分组。 */
export interface SubagentEventFrame {
  type: 'subagent_event';
  threadId: string;
  subagentId: string;
  agent: string;
  task: string;
  event: AgentSessionEvent;
}

/** v0.5：子 agent 的 report/send 产出（worker 按注册表重盖身份）。 */
export interface SubagentMessageFrame {
  type: 'subagent_message';
  threadId: string;
  subagentId: string;
  agent: string;
  text: string;
  /** 仅兄弟路由（父模型中介转发）时存在。 */
  to?: string;
}

/** thread/list 行（host 会话表）。 */
export interface ThreadListEntry {
  threadId: string;
  cwd: string;
  sessionPath: string | null;
  isStreaming: boolean;
  state: 'live' | 'parked' | 'dead';
}

export type HubFrame =
  | ResponseFrame
  | EventFrame
  | UiRequestFrame
  | HeartbeatFrame
  | HubErrorFrame
  | ThreadDiedFrame
  | SubagentEventFrame
  | SubagentMessageFrame;

/** 帧词表（与 pai-cli 一侧逐一对应；测试做封闭断言）。 */
export const HUB_FRAME_TYPES = [
  'response',
  'event',
  'ui_request',
  'heartbeat',
  'hub_error',
  'thread_died',
  'subagent_event',
  'subagent_message',
] as const;

// 编译期封闭断言：词表与类型联合双向绑定（漂移即编译失败）。
type CoversUnion<T, U extends T> = [T] extends [U] ? unknown : never;
const _hubCommandsCover = null as unknown as CoversUnion<HubCommand['type'], (typeof HUB_COMMAND_TYPES)[number]>;
void _hubCommandsCover;
const _hubFramesCover = null as unknown as CoversUnion<HubFrame['type'], (typeof HUB_FRAME_TYPES)[number]>;
void _hubFramesCover;
