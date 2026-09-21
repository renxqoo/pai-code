/** settings 域命令（hub 级设置 + 技能面 + 运行档位）。 */
import type { PaiCommand } from '@paiapp/contracts';

import type { HubResult } from '../errors';
import type { Transport } from '../transport';
import { TIMEOUTS } from '../timeouts';

type Input<C extends PaiCommand['type']> = Omit<Extract<PaiCommand, { type: C }>, 'type'>;

export interface SettingsCommands {
  get(input: Input<'settings/get'>): Promise<HubResult<unknown>>;
  set(input: Input<'settings/set'>): Promise<HubResult<unknown>>;
  listSkills(input: Input<'skills/list'>): Promise<HubResult<unknown>>;
  setSkillEnabled(input: Input<'skills/set_enabled'>): Promise<HubResult<unknown>>;
  setIdleRetireMs(input: Input<'set_idle_retire_ms'>): Promise<HubResult<unknown>>;
}

export function createSettingsCommands(send: Transport): SettingsCommands {
  return {
    get: (input) => send<unknown>({ type: 'settings/get', ...input }, TIMEOUTS.default),
    set: (input) => send<unknown>({ type: 'settings/set', ...input }, TIMEOUTS.default),
    listSkills: (input) => send<unknown>({ type: 'skills/list', ...input }, TIMEOUTS.default),
    setSkillEnabled: (input) => send<unknown>({ type: 'skills/set_enabled', ...input }, TIMEOUTS.default),
    setIdleRetireMs: (input) => send<unknown>({ type: 'set_idle_retire_ms', ...input }, TIMEOUTS.default),
  };
}
