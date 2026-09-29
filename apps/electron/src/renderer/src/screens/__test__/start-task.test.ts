import { describe, expect, test } from 'bun:test';

import type { ApiOutcome } from '@paiapp/contracts';

import { copyOfError } from '@/lib/error-text';
import { copy } from '@/strings';

import { startTask, worktreeStartFeedback, type NewTaskStart, type StartTaskDeps } from '../start-task';

/**
 * 新建任务提交链（SESSION-WORKTREE-WORKFLOW §1.5 创建提交原子性）：会话出生在树里
 * （cwd = 树路径，弹窗开关已建树）；start 失败自动回滚 remove。
 */

const BASE: NewTaskStart = {
  cwd: '/w/app',
  worktreePath: null,
  trusted: true,
  model: 'glm/glm-5.3',
  permissionMode: null,
  thinkingLevel: null,
  text: '请修复构建',
  attachments: [],
};

const TREE = '/w/.x-harness-user-worktrees/app-feat-login';

type Seen = {
  removed: Array<{ cwd: string; path: string }>
  starts: Array<NewTaskStart>
  rollbackErrors: string[]
};

function harness(over: {
  remove?: () => Promise<ApiOutcome<'git/worktree/remove'>>
  onCreate?: (input: NewTaskStart) => Promise<boolean>
}): { deps: StartTaskDeps; seen: Seen } {
  const seen: Seen = { removed: [], starts: [], rollbackErrors: [] };
  const deps: StartTaskDeps = {
    removeWorktree:
      over.remove ??
      ((cwd: string, path: string): Promise<ApiOutcome<'git/worktree/remove'>> => {
        seen.removed.push({ cwd, path });
        return Promise.resolve({ ok: true, data: null });
      }),
    onCreate:
      over.onCreate ??
      ((input: NewTaskStart): Promise<boolean> => {
        seen.starts.push(input);
        return Promise.resolve(true);
      }),
    onRollbackError: (message) => seen.rollbackErrors.push(message),
  };
  return { deps, seen };
}

describe('startTask 提交链', () => {
  test('未配 worktree：直达建会话（worktreePath null，零回滚）', async () => {
    const { deps, seen } = harness({});
    expect(await startTask(BASE, deps)).toBe(true);
    expect(seen.removed).toEqual([]);
    expect(seen.starts).toEqual([{ ...BASE, worktreePath: null }]);
  });

  test('已建树：会话出生在树里（cwd = 树路径）', async () => {
    const { deps, seen } = harness({});
    expect(await startTask({ ...BASE, cwd: TREE, worktreePath: TREE }, deps)).toBe(true);
    expect(seen.starts).toEqual([{ ...BASE, cwd: TREE, worktreePath: TREE }]);
    expect(seen.removed).toEqual([]);
  });

  test('症状回归「start 失败自动回滚」：start 失败 → remove 回滚已建树', async () => {
    const { deps, seen } = harness({ onCreate: (): Promise<boolean> => Promise.resolve(false) });
    expect(await startTask({ ...BASE, cwd: TREE, worktreePath: TREE }, deps)).toBe(false);
    expect(seen.removed).toEqual([{ cwd: TREE, path: TREE }]);
    expect(seen.rollbackErrors).toEqual([]);
  });

  test('回滚失败如实报（孤儿树由「清理」双入口兜底）', async () => {
    const { deps, seen } = harness({
      onCreate: (): Promise<boolean> => Promise.resolve(false),
      remove: (): Promise<ApiOutcome<'git/worktree/remove'>> => Promise.resolve({ ok: false, error: { kind: 'worktree_in_use' } }),
    });
    expect(await startTask({ ...BASE, cwd: TREE, worktreePath: TREE }, deps)).toBe(false);
    expect(seen.rollbackErrors).toEqual([copyOfError({ kind: 'worktree_in_use' })]);
  });
});

describe('worktreeStartFeedback（§1.3 按入口分句）', () => {
  test('无来源 + 建树 → 「会话将在 <path> 中开始」', () => {
    expect(worktreeStartFeedback('/w/wt-a', false)).toBe(copy.branch.wtStartPending('/w/wt-a'));
  });

  test('有来源不在此报（busy/idle/deferred 分句走 worktreeNotice 事件）', () => {
    expect(worktreeStartFeedback('/w/wt-a', true)).toBeNull();
  });
});
