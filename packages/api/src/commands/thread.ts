/**
 * thread 域命令（T40 §2b）：入参类型从 contracts PaiCommand 判别联合抽取（零复制）；
 * 每方法内定超时档；响应原样（收窄视图在 W3 views/ 并入后于域方法内应用）。
 */
import type { PaiCommand } from '@paiapp/contracts';

import type { HubResult } from '../errors';
import type { Transport } from '../transport';
import { TIMEOUTS } from '../timeouts';

type StartInput = Omit<Extract<PaiCommand, { type: 'thread/start' }>, 'type'>;
type ResumeInput = Omit<Extract<PaiCommand, { type: 'thread/resume' }>, 'type'>;
type RegisterInput = Omit<Extract<PaiCommand, { type: 'thread/register' }>, 'type'>;
type KeepaliveInput = Omit<Extract<PaiCommand, { type: 'thread/set_keepalive' }>, 'type'>;
type RetireInput = Omit<Extract<PaiCommand, { type: 'thread/retire' }>, 'type'>;
type StopInput = Omit<Extract<PaiCommand, { type: 'thread/stop' }>, 'type'>;
type DeleteInput = Omit<Extract<PaiCommand, { type: 'thread/delete' }>, 'type'>;

export interface ThreadCommands {
  start(input: StartInput): Promise<HubResult<unknown>>;
  resume(input: ResumeInput): Promise<HubResult<unknown>>;
  list(): Promise<HubResult<unknown>>;
  listSaved(input: { cwd: string }): Promise<HubResult<unknown>>;
  register(input: RegisterInput): Promise<HubResult<unknown>>;
  setKeepalive(input: KeepaliveInput): Promise<HubResult<unknown>>;
  retire(input: RetireInput): Promise<HubResult<unknown>>;
  stop(input: StopInput): Promise<HubResult<unknown>>;
  delete(input: DeleteInput): Promise<HubResult<unknown>>;
}

export function createThreadCommands(send: Transport): ThreadCommands {
  return {
    start: (input) => send<unknown>({ type: 'thread/start', ...input }, TIMEOUTS.default),
    resume: (input) => send<unknown>({ type: 'thread/resume', ...input }, TIMEOUTS.default),
    list: () => send<unknown>({ type: 'thread/list' }, TIMEOUTS.default),
    listSaved: (input) => send<unknown>({ type: 'thread/list_saved', ...input }, TIMEOUTS.default),
    register: (input) => send<unknown>({ type: 'thread/register', ...input }, TIMEOUTS.default),
    setKeepalive: (input) => send<unknown>({ type: 'thread/set_keepalive', ...input }, TIMEOUTS.default),
    retire: (input) => send<unknown>({ type: 'thread/retire', ...input }, TIMEOUTS.default),
    stop: (input) => send<unknown>({ type: 'thread/stop', ...input }, TIMEOUTS.default),
    delete: (input) => send<unknown>({ type: 'thread/delete', ...input }, TIMEOUTS.default),
  };
}
