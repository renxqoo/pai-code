import { describe, expect, test } from 'bun:test';

import type { GitBranchesView } from '@paiapp/contracts';

import { copy } from '@/strings';

import { worktreeStartState } from '../worktree-start-state';

const REPO: GitBranchesView = { isRepo: true, current: 'main', branches: ['dev', 'main'], dirtyFiles: 0 };

describe('worktreeStartState（§1.5 入口禁用态状态机）', () => {
  test('表驱动：六态禁用文案各不同，正常态启用', () => {
    const cases: ReadonlyArray<[string, Parameters<typeof worktreeStartState>, string | null]> = [
      ['loading → 分支信息读取中', [null, true, false], copy.branch.wtStartLoading],
      ['failed → 分支信息不可用', [null, false, true], copy.branch.wtStartFailed],
      ['view 缺席（垃圾输入）→ 同 failed 降级不崩', [null, false, false], copy.branch.wtStartFailed],
      ['非 git 目录 → 非仓原因', [{ isRepo: false, current: null, branches: [], dirtyFiles: 0 }, false, false], copy.branch.wtStartOffRepo],
      [
        'cwd 已在树内 → 正向指引',
        [{ ...REPO, gitDir: '/w/proj/.git/worktrees/feat-x' }, false, false],
        copy.branch.wtStartNested,
      ],
      ['游离 HEAD → 先切回分支', [{ ...REPO, current: null }, false, false], copy.branch.wtStartDetached],
    ];
    for (const [name, [view, loading, failed], reason] of cases) {
      const state = worktreeStartState(view, loading, failed);
      expect(state.disabled, name).toBe(true);
      expect(state.reason, name).toBe(reason);
      expect(state.reason, name).not.toBe('');
    }
  });

  test('主仓正常态：启用且无原因（锁态不在状态机内——建树不动主仓）', () => {
    expect(worktreeStartState(REPO, false, false)).toEqual({ disabled: false, reason: null });
    expect(worktreeStartState({ ...REPO, gitDir: '/w/proj/.git' }, false, false)).toEqual({ disabled: false, reason: null });
  });

  test('五类禁用原因互不相同（状态可辨识）', () => {
    const reasons = new Set([
      worktreeStartState(null, true, false).reason,
      worktreeStartState(null, false, true).reason,
      worktreeStartState({ isRepo: false, current: null, branches: [], dirtyFiles: 0 }, false, false).reason,
      worktreeStartState({ ...REPO, gitDir: '/w/.git/worktrees/x' }, false, false).reason,
      worktreeStartState({ ...REPO, current: null }, false, false).reason,
    ]);
    expect(reasons.size).toBe(5);
  });
});
