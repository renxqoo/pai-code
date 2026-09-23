/** settings 域命令（hub 级设置 + 技能面 + 运行档位）。 */
import type { PaiCommand } from '@paiapp/contracts';

import type { HubResult } from '../errors';
import type { Transport } from '../transport';
import { TIMEOUTS } from '../timeouts';

type Input<C extends PaiCommand['type']> = Omit<Extract<PaiCommand, { type: C }>, 'type'>;

export interface SettingsCommands {
  get(input: Input<'settings/get'>): Promise<HubResult<unknown>>;
  set(input: Input<'settings/set'>): Promise<HubResult<unknown>>;
  inspectSkills(input: Input<'skills/inspect'>): Promise<HubResult<unknown>>;
  listSkills(input: Input<'skills/list'>): Promise<HubResult<unknown>>;
  installSkill(input: Input<'skills/install'>): Promise<HubResult<unknown>>;
  setSkillEnabled(input: Input<'skills/set_enabled'>): Promise<HubResult<unknown>>;
  removeSkill(input: Input<'skills/remove'>): Promise<HubResult<unknown>>;
  listPlugins(input: Input<'plugins/list'>): Promise<HubResult<unknown>>;
  inspectPlugins(input: Input<'plugins/inspect'>): Promise<HubResult<unknown>>;
  installPlugin(input: Input<'plugins/install'>): Promise<HubResult<unknown>>;
  uninstallPlugin(input: Input<'plugins/uninstall'>): Promise<HubResult<unknown>>;
  setPluginEnabled(input: Input<'plugins/set_enabled'>): Promise<HubResult<unknown>>;
  removePlugin(input: Input<'plugins/remove'>): Promise<HubResult<unknown>>;
  hotInstallPlugin(input: Input<'plugins/hot_install'>): Promise<HubResult<unknown>>;
  hotUninstallPlugin(input: Input<'plugins/hot_uninstall'>): Promise<HubResult<unknown>>;
  listPluginProposals(input: Input<'plugins/trusted_source/list'>): Promise<HubResult<unknown>>;
  confirmPluginProposal(input: Input<'plugins/trusted_source/confirm'>): Promise<HubResult<unknown>>;
  rejectPluginProposal(input: Input<'plugins/trusted_source/reject'>): Promise<HubResult<unknown>>;
  setIdleRetireMs(input: Input<'set_idle_retire_ms'>): Promise<HubResult<unknown>>;
}

export function createSettingsCommands(send: Transport): SettingsCommands {
  return {
    get: (input) => send<unknown>({ type: 'settings/get', ...input }, TIMEOUTS.default),
    set: (input) => send<unknown>({ type: 'settings/set', ...input }, TIMEOUTS.default),
    inspectSkills: (input) => send<unknown>({ type: 'skills/inspect', ...input }, TIMEOUTS.default),
    listSkills: (input) => send<unknown>({ type: 'skills/list', ...input }, TIMEOUTS.default),
    installSkill: (input) => send<unknown>({ type: 'skills/install', ...input }, TIMEOUTS.default),
    setSkillEnabled: (input) => send<unknown>({ type: 'skills/set_enabled', ...input }, TIMEOUTS.default),
    removeSkill: (input) => send<unknown>({ type: 'skills/remove', ...input }, TIMEOUTS.default),
    listPlugins: (input) => send<unknown>({ type: 'plugins/list', ...input }, TIMEOUTS.default),
    inspectPlugins: (input) => send<unknown>({ type: 'plugins/inspect', ...input }, TIMEOUTS.default),
    installPlugin: (input) => send<unknown>({ type: 'plugins/install', ...input }, TIMEOUTS.default),
    uninstallPlugin: (input) => send<unknown>({ type: 'plugins/uninstall', ...input }, TIMEOUTS.default),
    setPluginEnabled: (input) => send<unknown>({ type: 'plugins/set_enabled', ...input }, TIMEOUTS.default),
    removePlugin: (input) => send<unknown>({ type: 'plugins/remove', ...input }, TIMEOUTS.default),
    hotInstallPlugin: (input) => send<unknown>({ type: 'plugins/hot_install', ...input }, TIMEOUTS.default),
    hotUninstallPlugin: (input) => send<unknown>({ type: 'plugins/hot_uninstall', ...input }, TIMEOUTS.default),
    listPluginProposals: (input) => send<unknown>({ type: 'plugins/trusted_source/list', ...input }, TIMEOUTS.default),
    confirmPluginProposal: (input) => send<unknown>({ type: 'plugins/trusted_source/confirm', ...input }, TIMEOUTS.default),
    rejectPluginProposal: (input) => send<unknown>({ type: 'plugins/trusted_source/reject', ...input }, TIMEOUTS.default),
    setIdleRetireMs: (input) => send<unknown>({ type: 'set_idle_retire_ms', ...input }, TIMEOUTS.default),
  };
}
