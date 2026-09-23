/**
 * 代理定义动作组（自 live-controller 拆出——max-lines 500 纪律，纯移动）：
 * 定义目录拉取 / 写 / 删；失败回查表文案，成功刷新目录快照。
 */
import type { ApiClient } from '@paiapp/api/client';
import type { AgentDefinition } from '@paiapp/contracts';

import { copyOfError } from '@/lib/error-text';

import type { LiveStore } from './store';

export interface AgentsActions {
  refreshAgentDefinitions(): Promise<void>;
  upsertAgentDefinition(definition: AgentDefinition, previous: { name: string; scope: 'user' | 'project'; project: string | null } | null): Promise<string | null>;
  removeAgentDefinition(key: { name: string; scope: 'user' | 'project'; project: string | null }): Promise<string | null>;
}

export function createAgentsActions(deps: { api: ApiClient; store: LiveStore }): AgentsActions {
  const { api, store } = deps;
  const refreshAgentDefinitions = async (): Promise<void> => {
    const outcome = await api.agents.definitions({});
    if (outcome.ok) store.setState({ agentDefinitions: outcome.data });
  };
  return {
    async refreshAgentDefinitions(): Promise<void> {
      await refreshAgentDefinitions();
    },
    async upsertAgentDefinition(definition, previous): Promise<string | null> {
      const outcome = await api.agents.upsert({ definition, previous });
      if (!outcome.ok) return copyOfError(outcome.error);
      await refreshAgentDefinitions();
      return null;
    },
    async removeAgentDefinition(key): Promise<string | null> {
      const outcome = await api.agents.remove(key);
      if (!outcome.ok) return copyOfError(outcome.error);
      await refreshAgentDefinitions();
      return null;
    },
  };
}
