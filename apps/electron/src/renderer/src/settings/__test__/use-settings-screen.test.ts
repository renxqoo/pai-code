import { describe, expect, test } from 'bun:test';

import { dispatchSectionEnter, pinnedSetOf, savedProjectsOf } from '../use-settings-screen';
import type { WorkspaceActions } from '@/live/workspace-actions';

type EnterActions = Parameters<typeof dispatchSectionEnter>[1];

function makeEnterActions(): { actions: EnterActions; calls: string[] } {
  const calls: string[] = [];
  const actions = {
    refreshPermissionRules: () => calls.push('permissions'),
    refreshAgents: () => calls.push('agents'),
    refreshSkills: () => calls.push('skills'),
    fetchDiagnostics: () => calls.push('diagnostics'),
  } satisfies EnterActions;
  return { actions, calls };
}

describe('按开即读派发', () => {
  test('四个目录分区进入时派发对应拉取动作', () => {
    for (const id of ['permissions', 'agents', 'skills', 'diagnostics'] as const) {
      const { actions, calls } = makeEnterActions();
      dispatchSectionEnter(id, actions);
      expect(calls).toEqual([id]);
    }
  });

  test('非目录分区不派发任何动作', () => {
    for (const id of ['general', 'providers', 'keys', 'history'] as const) {
      const { actions, calls } = makeEnterActions();
      dispatchSectionEnter(id, actions);
      expect(calls).toEqual([]);
    }
  });

  test('派发动作签名与 WorkspaceActions 面对齐（编译期防漂移）', () => {
    const check: Record<keyof EnterActions, keyof WorkspaceActions> = {
      refreshPermissionRules: 'refreshPermissionRules',
      refreshAgents: 'refreshAgents',
      refreshSkills: 'refreshSkills',
      fetchDiagnostics: 'fetchDiagnostics',
    };
    expect(Object.keys(check).length).toBe(4);
  });
});

describe('历史分区派生', () => {
  test('项目目录按首现顺序去重', () => {
    expect(savedProjectsOf([
      { sessionPath: '/a/1.jsonl', title: 'a1', cwd: '/a', modifiedAt: 1, messageCount: 1 },
      { sessionPath: '/b/1.jsonl', title: 'b1', cwd: '/b', modifiedAt: 2, messageCount: 1 },
      { sessionPath: '/a/2.jsonl', title: 'a2', cwd: '/a', modifiedAt: 3, messageCount: 2 },
    ])).toEqual(['/a', '/b']);
    expect(savedProjectsOf([])).toEqual([]);
  });

  test('置顶键集合来自 preferences.pinnedSessions', () => {
    const pinned = pinnedSetOf(['/a/1.jsonl', '/b/1.jsonl', '/a/1.jsonl']);
    expect(pinned.has('/a/1.jsonl')).toBe(true);
    expect(pinned.has('/c/1.jsonl')).toBe(false);
    expect(pinned.size).toBe(2);
  });
});
