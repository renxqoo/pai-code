import type { SubagentModel } from './thread-model';

export type PanelSummary = {
  workingCount: number;
  settledCount: number;
  /** 已计入的 token 合计（无计量值的子代理不计入） */
  totalTokens: number;
};

/** 面板汇总：进行中 / 已完成计数与 token 合计，随列表实时更新。 */
export function summarizeAgents(agents: readonly SubagentModel[]): PanelSummary {
  let workingCount = 0;
  let settledCount = 0;
  let totalTokens = 0;
  for (const agent of agents) {
    if (agent.status === 'working') {
      workingCount += 1;
    } else {
      settledCount += 1;
    }
    if (agent.tokens !== null && Number.isFinite(agent.tokens) && agent.tokens > 0) {
      totalTokens += agent.tokens;
    }
  }
  return { workingCount, settledCount, totalTokens };
}

/** 子代理耗时：进行中实时累加，已完成冻结在 endedAt；垃圾输入降级为 0。 */
export function agentElapsedMs(
  agent: Pick<SubagentModel, 'startedAt' | 'endedAt'>,
  now: number,
): number {
  const endAt = agent.endedAt ?? now;
  if (!Number.isFinite(endAt) || !Number.isFinite(agent.startedAt)) return 0;
  return Math.max(0, endAt - agent.startedAt);
}
