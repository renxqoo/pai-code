import type { GitBranchesView } from '@paiapp/contracts';

import { copy } from '@/strings';

/** 「在独立 worktree 开始」入口可用性（SESSION-WORKTREE-WORKFLOW §1.5 状态机，挂动作行禁用态 + 原因）。 */
export type WorktreeStartState = {
  disabled: boolean
  reason: string | null
};

/**
 * 状态机单一真相：loading/failed（分支信息面）→ 非 git → cwd 已在树内（正向指引）→
 * 游离 HEAD（create verb 拒 worktree_detached_head）→ 可用。垃圾输入（view 缺席）按
 * 「分支信息不可用」降级禁用，不崩。
 */
export function worktreeStartState(view: GitBranchesView | null, loading: boolean, failed: boolean): WorktreeStartState {
  if (loading) return { disabled: true, reason: copy.branch.wtStartLoading };
  if (failed || view === null) return { disabled: true, reason: copy.branch.wtStartFailed };
  if (!view.isRepo) return { disabled: true, reason: copy.branch.wtStartOffRepo };
  if (view.gitDir?.includes('/.git/worktrees/') === true) return { disabled: true, reason: copy.branch.wtStartNested };
  if (view.current === null) return { disabled: true, reason: copy.branch.wtStartDetached };
  return { disabled: false, reason: null };
}
