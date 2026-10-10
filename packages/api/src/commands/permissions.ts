/** permissions 域命令（会话级权限模式读写）。 */
import type { X3codeCommand } from '@x3code/contracts';

import type { HubResult } from '../errors';
import type { Transport } from '../transport';
import { TIMEOUTS } from '../timeouts';

type Input<C extends X3codeCommand['type']> = Omit<Extract<X3codeCommand, { type: C }>, 'type'>;

export interface PermissionCommands {
  getMode(input: Input<'permission/get_mode'>): Promise<HubResult<unknown>>;
  setMode(input: Input<'permission/set_mode'>): Promise<HubResult<unknown>>;
}

export function createPermissionCommands(send: Transport): PermissionCommands {
  return {
    getMode: (input) => send<unknown>({ type: 'permission/get_mode', ...input }, TIMEOUTS.default),
    setMode: (input) => send<unknown>({ type: 'permission/set_mode', ...input }, TIMEOUTS.default),
  };
}
