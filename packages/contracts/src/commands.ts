import type { HubCommand } from './hub-protocol';

/**
 * Pai 实际发出的命令子集（编码层形状校验以此为准）。
 * 全量命令词表见 hub-protocol 的 HUB_COMMAND_TYPES；
 * 此处增删 = 功能面变化，同步 T10 方案的 API 面表。
 */
export type PaiCommandType =
  | 'thread/start'
  | 'thread/resume'
  | 'thread/stop'
  | 'thread/list'
  | 'thread/list_saved'
  | 'prompt'
  | 'steer'
  | 'follow_up'
  | 'abort'
  | 'clear_queue'
  | 'compact'
  | 'get_state'
  | 'get_messages'
  | 'get_entries'
  | 'get_models'
  | 'set_model'
  | 'set_thinking_level'
  | 'get_thinking_levels'
  | 'get_session_stats'
  | 'set_session_name'
  | 'get_commands'
  | 'auth/list'
  | 'auth/set_api_key'
  | 'auth/remove_key'
  | 'ui_response'
  | 'subagent/steer';

export type PaiCommand = Extract<HubCommand, { type: PaiCommandType }>;

export const PAI_COMMAND_TYPES = [
  'thread/start',
  'thread/resume',
  'thread/stop',
  'thread/list',
  'thread/list_saved',
  'prompt',
  'steer',
  'follow_up',
  'abort',
  'clear_queue',
  'compact',
  'get_state',
  'get_messages',
  'get_entries',
  'get_models',
  'set_model',
  'set_thinking_level',
  'get_thinking_levels',
  'get_session_stats',
  'set_session_name',
  'get_commands',
  'auth/list',
  'auth/set_api_key',
  'auth/remove_key',
  'ui_response',
  'subagent/steer',
] as const satisfies readonly PaiCommandType[];

// 编译期封闭断言：Pai 命令词表与类型联合双向绑定（漏登记即编译失败）。
type CoversUnion<T, U extends T> = [T] extends [U] ? unknown : never;
const _paiCommandsCover = null as unknown as CoversUnion<PaiCommandType, (typeof PAI_COMMAND_TYPES)[number]>;
void _paiCommandsCover;
