import type { HubCommand } from './hub-commands';

/**
 * Pai 实际发出的命令子集（编码层形状校验以此为准）。
 * 全量命令词表见 hub-protocol 的 HUB_COMMAND_TYPES；
 * 此处增删 = 功能面变化，同步 T39 方案的 API 面表。
 *
 * 读命令语义：get_state/get_entries/get_inflight/get_subagents/get_pending_dialogs
 * 对 parked/dead thread 由 host 本地直读应答（不唤醒 worker，直读不可用自动回退
 * 唤醒路径）；live thread 恒透传 worker。其余线程域命令对非 live thread 自动唤醒。
 */
export type PaiCommandType =
  | 'thread/start'
  | 'thread/resume'
  | 'thread/register'
  | 'thread/stop'
  | 'thread/retire'
  | 'thread/set_keepalive'
  | 'thread/list'
  | 'thread/list_saved'
  | 'get_host_info'
  | 'set_idle_retire_ms'
  | 'prompt'
  | 'abort'
  | 'clear_queue'
  | 'queue/drop'
  | 'queue/send_now'
  | 'get_state'
  | 'get_entries'
  | 'get_inflight'
  | 'get_subagents'
  | 'get_pending_dialogs'
  | 'get_models'
  | 'set_model'
  | 'set_thinking_level'
  | 'get_thinking_level'
  | 'permission/set_mode'
  | 'permission/get_mode'
  | 'settings/get'
  | 'settings/set'
  | 'skills/inspect'
  | 'skills/install'
  | 'skills/list'
  | 'skills/set_enabled'
  | 'skills/remove'
  | 'get_session_stats'
  | 'get_token_analytics'
  | 'set_session_name'
  | 'get_commands'
  | 'ui_response'
  | 'subagent/steer'
  | 'bash'
  | 'abort_bash'
  | 'fork'
  | 'compact'
  | 'thread/delete'
  | 'agents/create'
  | 'agents/remove'
  | 'plugins/list'
  | 'plugins/inspect'
  | 'plugins/install'
  | 'plugins/uninstall'
  | 'plugins/set_enabled'
  | 'plugins/remove'
  | 'plugins/hot_install'
  | 'plugins/hot_uninstall';

export type PaiCommand = Extract<HubCommand, { type: PaiCommandType }>;

export const PAI_COMMAND_TYPES = [
  'thread/start',
  'thread/resume',
  'thread/register',
  'thread/stop',
  'thread/retire',
  'thread/set_keepalive',
  'thread/list',
  'thread/list_saved',
  'get_host_info',
  'set_idle_retire_ms',
  'prompt',
  'abort',
  'clear_queue',
  'queue/drop',
  'queue/send_now',
  'get_state',
  'get_entries',
  'get_inflight',
  'get_subagents',
  'get_pending_dialogs',
  'get_models',
  'set_model',
  'set_thinking_level',
  'get_thinking_level',
  'permission/set_mode',
  'permission/get_mode',
  'settings/get',
  'settings/set',
  'skills/inspect',
  'skills/install',
  'skills/list',
  'skills/set_enabled',
  'skills/remove',
  'get_session_stats',
  'get_token_analytics',
  'set_session_name',
  'get_commands',
  'ui_response',
  'subagent/steer',
  'bash',
  'abort_bash',
  'fork',
  'compact',
  'thread/delete',
  'agents/create',
  'agents/remove',
] as const satisfies readonly PaiCommandType[];

// 编译期封闭断言：Pai 命令词表与类型联合双向绑定（漏登记即编译失败）。
type CoversUnion<T, U extends T> = [T] extends [U] ? unknown : never;
const _paiCommandsCover = null as unknown as CoversUnion<PaiCommandType, (typeof PAI_COMMAND_TYPES)[number]>;
void _paiCommandsCover;
