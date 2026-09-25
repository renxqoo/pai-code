import { describe, expect, test } from 'bun:test';

import type { TodoSnapshotEventData } from '@paiapp/contracts';

import { foldThreadEvent } from '../fold-events';
import { foldHydrate } from '../fold-hydrate';
import { initialThreadState } from '../live-thread-state';

/**
 * todo 快照折叠（T44）：todo/snapshot 事件 last-wins 整体替换；
 * 水化载荷带快照才替换（缺席 = 窗口无快照，不得清既有快照）。
 */

const snapshot = (seq: number, subject: string): TodoSnapshotEventData => ({
  seq,
  tasks: [{ id: '1', subject, status: 'in_progress' }],
  edges: [],
});

describe('todoSnapshot 事件折叠', () => {
  test('整体替换（last-wins）', () => {
    let state = foldThreadEvent(initialThreadState, { type: 'todoSnapshot', threadId: 't', snapshot: snapshot(1, 'A') }, 0);
    expect(state.todo?.tasks[0]?.subject).toBe('A');
    state = foldThreadEvent(state, { type: 'todoSnapshot', threadId: 't', snapshot: snapshot(2, 'B') }, 0);
    expect(state.todo).toEqual(snapshot(2, 'B'));
  });

  test('空清单快照 = 显式空态（清空既有）', () => {
    const state = foldThreadEvent(initialThreadState, { type: 'todoSnapshot', threadId: 't', snapshot: snapshot(1, 'A') }, 0);
    const cleared = foldThreadEvent(state, { type: 'todoSnapshot', threadId: 't', snapshot: { seq: 2, tasks: [], edges: [] } }, 0);
    expect(cleared.todo).toEqual({ seq: 2, tasks: [], edges: [] });
  });
});

describe('水化载荷的 todo 槽', () => {
  test('initial 带快照 → 写入；不带 → 保持 null', () => {
    const withTodo = foldHydrate(initialThreadState, { kind: 'hydrate/initial', items: [], cursor: null, todo: snapshot(1, 'A') });
    expect(withTodo.todo).toEqual(snapshot(1, 'A'));
    const without = foldHydrate(initialThreadState, { kind: 'hydrate/initial', items: [], cursor: null });
    expect(without.todo).toBeNull();
  });

  test('reconcile 缺席快照不清既有（回归症状：undefined 会被当快照写入）', () => {
    const seeded = foldThreadEvent(initialThreadState, { type: 'todoSnapshot', threadId: 't', snapshot: snapshot(1, 'A') }, 0);
    const kept = foldHydrate(seeded, { kind: 'hydrate/reconcile', items: [], cursor: 1, dropLiveTurn: false });
    expect(kept.todo).toEqual(snapshot(1, 'A'));
    const replaced = foldHydrate(seeded, { kind: 'hydrate/reconcile', items: [], cursor: 1, dropLiveTurn: false, todo: snapshot(2, 'B') });
    expect(replaced.todo).toEqual(snapshot(2, 'B'));
  });

  test('rebuild 同规（带则合并、缺则保留）', () => {
    const seeded = foldThreadEvent(initialThreadState, { type: 'todoSnapshot', threadId: 't', snapshot: snapshot(1, 'A') }, 0);
    expect(foldHydrate(seeded, { kind: 'hydrate/rebuild', items: [], cursor: 1 }).todo).toEqual(snapshot(1, 'A'));
    expect(foldHydrate(seeded, { kind: 'hydrate/rebuild', items: [], cursor: 1, todo: snapshot(3, 'C') }).todo).toEqual(snapshot(3, 'C'));
  });
});

describe('单调合并（并发回归）', () => {
  test('症状回归「水化旧快照复活」：事件已到 seq 3，reconcile 带 seq 2 载荷不得回退', () => {
    let state = foldThreadEvent(initialThreadState, { type: 'todoSnapshot', threadId: 't', snapshot: snapshot(2, 'B') }, 0);
    state = foldThreadEvent(state, { type: 'todoSnapshot', threadId: 't', snapshot: snapshot(3, 'C') }, 0);
    const revived = foldHydrate(state, { kind: 'hydrate/reconcile', items: [], cursor: 1, dropLiveTurn: false, todo: snapshot(1, 'A') });
    expect(revived.todo?.tasks[0]?.subject).toBe('C');
  });

  test('事件乱序（旧 seq 后到）不回退；同 seq 幂等重投可替换', () => {
    const state = foldThreadEvent(initialThreadState, { type: 'todoSnapshot', threadId: 't', snapshot: snapshot(5, 'E') }, 0);
    expect(foldThreadEvent(state, { type: 'todoSnapshot', threadId: 't', snapshot: snapshot(4, 'D') }, 0).todo?.tasks[0]?.subject).toBe('E');
    expect(foldThreadEvent(state, { type: 'todoSnapshot', threadId: 't', snapshot: snapshot(5, 'E2') }, 0).todo?.tasks[0]?.subject).toBe('E2');
  });

  test('initial 重置不丢更优快照（事件已到的新快照胜过陈旧全量载荷）', () => {
    const state = foldThreadEvent(initialThreadState, { type: 'todoSnapshot', threadId: 't', snapshot: snapshot(9, 'I') }, 0);
    const after = foldHydrate(state, { kind: 'hydrate/initial', items: [], cursor: null, todo: snapshot(1, 'A') });
    expect(after.todo?.tasks[0]?.subject).toBe('I');
  });
});
