import { describe, expect, test } from 'bun:test';

import { copy } from '@/strings';

import { branchSegmentOf } from '../branch-segment';

describe('branchSegmentOf', () => {
  test('加载中：给加载文案且弱化（即使已有旧视图）', () => {
    const view = { isRepo: true, current: 'main', branches: ['main'], dirtyFiles: 0 };
    expect(branchSegmentOf(view, true, false)).toEqual({ label: copy.composer.branchLoading, muted: true });
  });

  test('失败/无视图：分支不可用', () => {
    expect(branchSegmentOf(null, false, true)).toEqual({ label: copy.composer.branchUnavailable, muted: true });
    expect(branchSegmentOf(null, false, false)).toEqual({ label: copy.composer.branchUnavailable, muted: true });
  });

  test('非 git 仓库：空形态文案', () => {
    expect(branchSegmentOf({ isRepo: false, current: null, branches: [], dirtyFiles: 0 }, false, false)).toEqual({
      label: copy.composer.notARepo,
      muted: true,
    });
  });

  test('游离 HEAD：明确文案而非空白', () => {
    expect(branchSegmentOf({ isRepo: true, current: null, branches: ['main'], dirtyFiles: 0 }, false, false)).toEqual({
      label: copy.composer.detachedHead,
      muted: true,
    });
  });

  test('正常仓库：真实分支名且不弱化', () => {
    expect(branchSegmentOf({ isRepo: true, current: 'feat/x', branches: ['feat/x', 'main'], dirtyFiles: 2 }, false, false)).toEqual({
      label: 'feat/x',
      muted: false,
    });
  });
});
