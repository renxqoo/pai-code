import { describe, expect, test } from 'bun:test';

import { copy } from '../index';

/**
 * 分支失败文案表：每个契约 reason 都要有专门文案（默认语言 zh）。
 * 症状回归：`invalid_branch` 曾漏配 → 界面直接显示「分支操作失败（invalid_branch）。」
 */
describe('branch.failed', () => {
  test.each(['branch_exists', 'invalid_branch', 'dirty_worktree', 'unknown_branch', 'not_a_repo', 'git_unavailable', 'cwd_not_found'])(
    '%s 有专门文案（不把 reason 码漏给用户）',
    (reason: string) => {
      expect(copy.branch.failed(reason)).not.toContain(reason);
    },
  );

  test('未知 reason 透传原因（排障可读，不吞）', () => {
    expect(copy.branch.failed('weird_state')).toContain('weird_state');
  });
});
