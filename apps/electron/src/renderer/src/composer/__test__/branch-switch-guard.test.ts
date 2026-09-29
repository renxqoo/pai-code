import { describe, expect, test } from 'bun:test';

import type { GitBranchesView } from '@paiapp/contracts';

import { copy } from '@/strings';

import { switchBlockedReason } from '../branch-switch-guard';

const VIEW: GitBranchesView = {
  isRepo: true,
  current: 'main',
  branches: ['dev', 'main'],
  dirtyFiles: 0,
  worktrees: [{ branch: 'dev', path: '/w/.x-harness-user-worktrees/app-dev' }],
};

describe('switchBlockedReason（点击时检查——行不禁用）', () => {
  test('锁定优先于占用：反馈锁因（含运行会话数）', () => {
    expect(switchBlockedReason(VIEW, true, 3, 'dev')).toBe(copy.branch.lockReason(3));
    expect(switchBlockedReason(VIEW, true, 3, 'main')).toBe(copy.branch.lockReason(3));
  });

  test('被 worktree 占用：反馈占用者路径', () => {
    expect(switchBlockedReason(VIEW, false, 0, 'dev')).toBe(copy.branch.occupiedBy('/w/.x-harness-user-worktrees/app-dev'));
  });

  test('可切（含当前分支/无占用）→ null；脏区不在这里拦（verb 恒重评）', () => {
    expect(switchBlockedReason(VIEW, false, 0, 'main')).toBeNull();
    expect(switchBlockedReason(null, false, 0, 'main')).toBeNull();
  });
});
