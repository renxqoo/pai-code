import type { SubagentModel } from './thread-model';

/**
 * 子代理在某一时刻的活动：`pause` = 在两段工具之间（推理中），
 * `tool` = 正有工具在跑，`idle` = 尚未出生或已结束。
 * 面板列表项的状态词从这一个判定出发。
 */
export type AgentActivity =
  | { kind: 'idle' }
  | { kind: 'pause' }
  | { kind: 'tool'; toolName: string };

export function agentActivity(
  agent: Pick<SubagentModel, 'status' | 'startedAt' | 'endedAt' | 'tools'>,
  now: number,
): AgentActivity {
  if (agent.status !== 'working') return { kind: 'idle' };
  if (!Number.isFinite(now) || now < agent.startedAt) return { kind: 'idle' };
  if (agent.endedAt !== null && now >= agent.endedAt) return { kind: 'idle' };
  const running = agent.tools.find((tool) => tool.status === 'running');
  if (running === undefined) return { kind: 'pause' };
  return { kind: 'tool', toolName: running.name };
}

/**
 * 面板列表项第二行的状态词：跑工具时该项改显「▸ 工具名」，返回 null；
 * 其余进行中状态统一显 Working。
 */
export function panelStatusLabelKey(activity: AgentActivity): 'working' | null {
  if (activity.kind === 'idle') return null;
  if (activity.kind === 'tool') return null;
  return 'working';
}
