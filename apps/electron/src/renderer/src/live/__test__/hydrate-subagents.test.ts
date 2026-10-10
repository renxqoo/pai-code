import { describe, expect, test } from 'bun:test';

import type { SubagentSnapshotView } from '@x3code/contracts';

import { createLiveStore } from '../store';

/** 子代理快照水化（T24 面板状态重建）：缺席/新增/合并不抹本地已知值。 */

const now = 1000;

function snapshot(over: Partial<SubagentSnapshotView> = {}): SubagentSnapshotView {
  return {
    agentId: 'a1',
    agentType: 'general-purpose',
    status: 'running',
    work: '探路',
    ...over,
  } as SubagentSnapshotView;
}

describe('hydrateSubagents', () => {
  test('空快照零操作；新条目落位（agentId/名/任务/状态）', () => {
    const store = createLiveStore();
    store.getState().hydrateSubagents('t1', [], now);
    expect(store.getState().threads['t1']?.agents ?? []).toEqual([]);

    store.getState().hydrateSubagents('t1', [snapshot()], now);
    const [agent] = store.getState().threads['t1']?.agents ?? [];
    expect(agent?.agentId).toBe('a1');
    expect(agent?.name).toBe('general-purpose');
    expect(agent?.task).toBe('探路');
    expect(agent?.status).toBe('running');
    expect(agent?.endedAt).toBeNull();
  });

  test('既有条目合并：快照缺 agentType/work 不抹本地已知值（复活旧档案字段缺席）', () => {
    const store = createLiveStore();
    store.getState().hydrateSubagents('t1', [snapshot({ work: '探路', agentType: 'explore' })], now);
    store.getState().hydrateSubagents(
      't1',
      [snapshot({ agentType: '', work: undefined, status: 'stopped' })],
      now + 5,
    );
    const agents = store.getState().threads['t1']?.agents ?? [];
    expect(agents.length).toBe(1);
    expect(agents[0]?.agentType).toBe('explore');
    expect(agents[0]?.task).toBe('探路');
    expect(agents[0]?.status).toBe('stopped');
    expect(agents[0]?.endedAt).toBe(now + 5);
  });
});
