/** models 域命令（目录/拨号/思考档）。 */
import type { PaiCommand } from '@paiapp/contracts';

import type { HubResult } from '../errors';
import type { Transport } from '../transport';
import { TIMEOUTS } from '../timeouts';

type Input<C extends PaiCommand['type']> = Omit<Extract<PaiCommand, { type: C }>, 'type'>;

export interface ModelCommands {
  getModels(): Promise<HubResult<unknown>>;
  setModel(input: Input<'set_model'>): Promise<HubResult<unknown>>;
  getThinkingLevel(input: Input<'get_thinking_level'>): Promise<HubResult<unknown>>;
  setThinkingLevel(input: Input<'set_thinking_level'>): Promise<HubResult<unknown>>;
}

export function createModelCommands(send: Transport): ModelCommands {
  return {
    getModels: () => send<unknown>({ type: 'get_models' }, TIMEOUTS.default),
    setModel: (input) => send<unknown>({ type: 'set_model', ...input }, TIMEOUTS.default),
    getThinkingLevel: (input) => send<unknown>({ type: 'get_thinking_level', ...input }, TIMEOUTS.default),
    setThinkingLevel: (input) => send<unknown>({ type: 'set_thinking_level', ...input }, TIMEOUTS.default),
  };
}
