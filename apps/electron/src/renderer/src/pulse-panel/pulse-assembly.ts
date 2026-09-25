import type { TodoSnapshotTask } from '@paiapp/contracts';

import type { SubagentModel } from '@/thread/thread-model';

/**
 * 速览面板装配层（纯函数，零 IO）：store 快照 → 面板视图模型。
 * 进程进度 / 运行中子代理 / 收起 chip 三段聚合的单一派生真相。
 */

/** 进程进度（done = completed 数；total = 任务总数）。 */
export type TodoProgress = { done: number; total: number };

export function todoProgressOf(tasks: readonly TodoSnapshotTask[]): TodoProgress {
  let done = 0;
  for (const task of tasks) {
    if (task.status === 'completed') done += 1;
  }
  return { done, total: tasks.length };
}

/** 运行中的子代理（展示序 = 列表序）。 */
export function runningAgentsOf(agents: readonly SubagentModel[]): SubagentModel[] {
  return agents.filter((agent) => agent.status === 'running');
}

/** 收起 chip 三段聚合：缺数据的段不产生（全空 = 只留面板名）。 */
export type PulseChipSegments = {
  /** git 变更段（null = 非仓库/无变更文件）。 */
  changes: { additions: number; deletions: number } | null;
  /** 进程段（null = 无任务）。 */
  progress: TodoProgress | null;
  /** 运行中子代理数（0 = 无）。 */
  running: number;
};

export function pulseChipSegmentsOf(input: {
  isRepo: boolean;
  additions: number;
  deletions: number;
  fileCount: number;
  tasks: readonly TodoSnapshotTask[];
  agents: readonly SubagentModel[];
}): PulseChipSegments {
  return {
    changes: input.isRepo && input.fileCount > 0 ? { additions: input.additions, deletions: input.deletions } : null,
    progress: input.tasks.length > 0 ? todoProgressOf(input.tasks) : null,
    running: runningAgentsOf(input.agents).length,
  };
}
