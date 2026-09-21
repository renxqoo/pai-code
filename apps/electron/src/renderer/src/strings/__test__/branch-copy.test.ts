import { expect, test } from 'bun:test';

import { copyOfError } from '@/lib/error-text';

/**
 * 分支族错误查表：每个失败 kind 都要有专门文案（默认语言 zh）。
 * 症状回归：`invalid_branch` 曾漏配 → 界面直接显示 kind 密文。
 */
const branchKinds = [
  'branch_exists',
  'invalid_branch',
  'dirty_worktree',
  'unknown_branch',
  'not_a_repo',
  'git_unavailable',
  'cwd_not_found',
] as const;

test.each(branchKinds)('errorCopy.%s 有专门文案（不把 kind 码漏给用户）', (kind) => {
  const text = copyOfError({ kind });
  expect(text.length).toBeGreaterThan(0);
  expect(text).not.toContain(kind);
});
