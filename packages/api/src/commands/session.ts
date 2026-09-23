/**
 * session 域命令（轮次执行面）：prompt 受理档 / compact 同步压缩档 / bash 24h 长命档
 * 为本域三档特殊面（T40 timeouts 单一真相）。
 */
import type { PaiCommand } from '@paiapp/contracts';

import type { HubResult } from '../errors';
import type { Transport } from '../transport';
import { TIMEOUTS } from '../timeouts';

type Input<C extends PaiCommand['type']> = Omit<Extract<PaiCommand, { type: C }>, 'type'>;

export interface SessionCommands {
  prompt(input: Input<'prompt'>): Promise<HubResult<unknown>>;
  abort(input: Input<'abort'>): Promise<HubResult<unknown>>;
  /** ack 命令（hub 成功响应无载荷）：成功恒为 null 视图。 */
  abortBash(input: Input<'abort_bash'>): Promise<HubResult<null>>;
  /** 响应携带被清队列文本快照（hub 先取后清）——session/clearQueue 路由折叠为 null，
   *  需要快照的消费方直接走 hub 域方法。 */
  clearQueue(input: Input<'clear_queue'>): Promise<HubResult<unknown>>;
  /** 单条移除排队消息（entryId 寻址；已消费/已清空 → hub state_conflict）。 */
  queueDrop(input: Input<'queue/drop'>): Promise<HubResult<null>>;
  /** 排队消息立即改向当前轮（仅 followUp 条目；无运行中轮 → hub streaming_window）。 */
  queueSendNow(input: Input<'queue/send_now'>): Promise<HubResult<null>>;
  fork(input: Input<'fork'>): Promise<HubResult<unknown>>;
  bash(input: Input<'bash'>): Promise<HubResult<unknown>>;
  compact(input: Input<'compact'>): Promise<HubResult<unknown>>;
  getEntries(input: Input<'get_entries'>): Promise<HubResult<unknown>>;
  getState(input: Input<'get_state'>): Promise<HubResult<unknown>>;
  getInflight(input: Input<'get_inflight'>): Promise<HubResult<unknown>>;
  getSubagents(input: Input<'get_subagents'>): Promise<HubResult<unknown>>;
  getPendingDialogs(input: Input<'get_pending_dialogs'>): Promise<HubResult<unknown>>;
  getSessionStats(input: Input<'get_session_stats'>): Promise<HubResult<unknown>>;
  getTokenAnalytics(input: Input<'get_token_analytics'>): Promise<HubResult<unknown>>;
  getCommands(input: Input<'get_commands'>): Promise<HubResult<unknown>>;
  setSessionName(input: Input<'set_session_name'>): Promise<HubResult<unknown>>;
}

/** ack 视图：成功无载荷恒折叠 null（帧解码对缺省 data 产出 undefined，消费方契约是 null）。 */
function ack(result: HubResult<unknown>): HubResult<null> {
  return result.ok ? { ok: true, data: null } : result;
}

export function createSessionCommands(send: Transport): SessionCommands {
  return {
    prompt: (input) => send<unknown>({ type: 'prompt', ...input }, TIMEOUTS.prompt),
    abort: (input) => send<unknown>({ type: 'abort', ...input }, TIMEOUTS.default),
    abortBash: (input) => send<unknown>({ type: 'abort_bash', ...input }, TIMEOUTS.default).then(ack),
    clearQueue: (input) => send<unknown>({ type: 'clear_queue', ...input }, TIMEOUTS.default),
    queueDrop: (input) => send<unknown>({ type: 'queue/drop', ...input }, TIMEOUTS.default).then(ack),
    queueSendNow: (input) => send<unknown>({ type: 'queue/send_now', ...input }, TIMEOUTS.default).then(ack),
    fork: (input) => send<unknown>({ type: 'fork', ...input }, TIMEOUTS.default),
    bash: (input) => send<unknown>({ type: 'bash', ...input }, TIMEOUTS.bash),
    compact: (input) => send<unknown>({ type: 'compact', ...input }, TIMEOUTS.compact),
    getEntries: (input) => send<unknown>({ type: 'get_entries', ...input }, TIMEOUTS.default),
    getState: (input) => send<unknown>({ type: 'get_state', ...input }, TIMEOUTS.default),
    getInflight: (input) => send<unknown>({ type: 'get_inflight', ...input }, TIMEOUTS.default),
    getSubagents: (input) => send<unknown>({ type: 'get_subagents', ...input }, TIMEOUTS.default),
    getPendingDialogs: (input) => send<unknown>({ type: 'get_pending_dialogs', ...input }, TIMEOUTS.default),
    getSessionStats: (input) => send<unknown>({ type: 'get_session_stats', ...input }, TIMEOUTS.default),
    getTokenAnalytics: (input) => send<unknown>({ type: 'get_token_analytics', ...input }, TIMEOUTS.default),
    getCommands: (input) => send<unknown>({ type: 'get_commands', ...input }, TIMEOUTS.default),
    setSessionName: (input) => send<unknown>({ type: 'set_session_name', ...input }, TIMEOUTS.default),
  };
}
