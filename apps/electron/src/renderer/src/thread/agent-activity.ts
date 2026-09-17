import type { SubagentModel } from './thread-model';

/**
 * 子代理在某一时刻的活动：`tool` = 正有工具在跑（面板行显工具名），
 * `pause` = 在两段工具之间（推理中，显状态词），`idle` = 未在执行。
 */
export type AgentActivity =
  | { kind: 'idle' }
  | { kind: 'pause' }
  | { kind: 'tool'; toolName: string };

export function agentActivity(
  agent: Pick<SubagentModel, 'status' | 'startedAt' | 'endedAt' | 'tools'>,
  now: number,
): AgentActivity {
  if (agent.status !== 'busy') return { kind: 'idle' };
  if (!Number.isFinite(now) || now < agent.startedAt) return { kind: 'idle' };
  if (agent.endedAt !== null && now >= agent.endedAt) return { kind: 'idle' };
  const running = agent.tools.find((tool) => tool.status === 'running');
  if (running === undefined) return { kind: 'pause' };
  return { kind: 'tool', toolName: running.name };
}
