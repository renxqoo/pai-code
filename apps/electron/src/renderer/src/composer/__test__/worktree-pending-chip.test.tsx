import { describe, expect, test } from 'bun:test';
import * as React from 'react';

import { render } from '@/testing/render';
import { copy } from '@/strings';

import { WorktreePendingChip } from '../worktree-pending-chip';

describe('WorktreePendingChip（新建页 worktree 树标记）', () => {
  test('分支名文案渲染；× 删除该 worktree 并取消', () => {
    let cleared = 0;
    const page = render(<WorktreePendingChip branch="feat-登录修复" onClear={() => { cleared += 1; }} />);
    expect(page.container.textContent).toContain(copy.branch.wtPendingChip('feat-登录修复'));
    const clear = [...page.container.querySelectorAll('button')].find(
      (b) => b.getAttribute('aria-label') === copy.branch.wtPendingClear,
    );
    clear?.click();
    expect(cleared).toBe(1);
    page.unmount();
  });
});
