import { describe, expect, test } from 'bun:test';

import type { TodoSnapshotTask } from '@paiapp/contracts';

import type { SubagentModel } from '@/thread/thread-model';

import { pulseChipSegmentsOf, runningAgentsOf, todoProgressOf } from '../pulse-assembly';

/**
 * 速览面板装配层（T44）：进程进度 / 运行中子代理 / chip 三段聚合的纯派生。
 */

function agent(id: string, status: SubagentModel['status']): SubagentModel {
  return {
    id,
    agentId: id,
    name: id,
    agentType: 'explore',
    task: `task-${id}`,
    model: '',
    effort: '',
    tokens: null,
    toolCount: 0,
    status,
    startedAt: 1_000,
    endedAt: status === 'running' ? null : 2_000,
    summary: '',
    pendingAsk: null,
    tools: [],
  };
}

function task(id: string, status: TodoSnapshotTask['status']): TodoSnapshotTask {
  return { id, subject: `subject-${id}`, status };
}

describe('todoProgressOf', () => {
  test.each([
    [[], { done: 0, total: 0 }],
    [[task('1', 'completed')], { done: 1, total: 1 }],
    [[task('1', 'completed'), task('2', 'in_progress'), task('3', 'pending')], { done: 1, total: 3 }],
    [[task('1', 'pending'), task('2', 'pending')], { done: 0, total: 2 }],
  ])('进度 %j', (tasks: TodoSnapshotTask[], expected: { done: number; total: number }) => {
    expect(todoProgressOf(tasks)).toEqual(expected);
  });
});

describe('runningAgentsOf', () => {
  test('只留 running（空列表/全终态 → 空）', () => {
    expect(runningAgentsOf([agent('a', 'running'), agent('b', 'idle'), agent('c', 'stopped')]).map((item) => item.id)).toEqual(['a']);
    expect(runningAgentsOf([])).toEqual([]);
    expect(runningAgentsOf([agent('a', 'stopped')])).toEqual([]);
  });
});

describe('pulseChipSegmentsOf', () => {
  const base = {
    isRepo: true,
    additions: 739,
    deletions: 290,
    fileCount: 12,
    tasks: [task('1', 'completed'), task('2', 'pending')],
    agents: [agent('a', 'running'), agent('b', 'running'), agent('c', 'stopped')],
  };

  test('三段齐出', () => {
    expect(pulseChipSegmentsOf(base)).toEqual({
      changes: { additions: 739, deletions: 290 },
      progress: { done: 1, total: 2 },
      running: 2,
    });
  });

  test('非仓库 / 零变更文件 → git 段缺（chip 不显更改）', () => {
    expect(pulseChipSegmentsOf({ ...base, isRepo: false }).changes).toBeNull();
    expect(pulseChipSegmentsOf({ ...base, fileCount: 0 }).changes).toBeNull();
  });

  test('无任务 → 进程段缺；无运行中 → running 0', () => {
    const segments = pulseChipSegmentsOf({ ...base, tasks: [], agents: [agent('a', 'stopped')] });
    expect(segments.progress).toBeNull();
    expect(segments.running).toBe(0);
  });

  test('全空 → 三段全缺（chip 只留面板名）', () => {
    expect(pulseChipSegmentsOf({ isRepo: false, additions: 0, deletions: 0, fileCount: 0, tasks: [], agents: [] })).toEqual({
      changes: null,
      progress: null,
      running: 0,
    });
  });
});
