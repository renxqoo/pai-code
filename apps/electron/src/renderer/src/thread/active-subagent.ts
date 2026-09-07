import type { SubagentModel } from './thread-model';

/**
 * 流内简略行只展示最近派生且仍在活动的子代理；
 * 全部结束后返回 null，简略行并入通知条摘要，不再单独占行。
 */
export function latestActiveAgent(agents: readonly SubagentModel[]): SubagentModel | null {
  let latest: SubagentModel | null = null;
  for (const agent of agents) {
    if (agent.status !== 'working') continue;
    if (latest === null || agent.startedAt > latest.startedAt) latest = agent;
  }
  return latest;
}
