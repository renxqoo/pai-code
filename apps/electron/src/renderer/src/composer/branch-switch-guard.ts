import type { GitBranchesView } from '@paiapp/contracts';

import { copy } from '@/strings';

/**
 * 切分支点击时守卫（行不禁用——原因在点击时检查并反馈，渲染层不做灰行预判）：
 * 返回不可切原因文案（锁定/已被 worktree 占用），null = 可切（脏区等由 verb 恒重评，
 * 真冲突弹冲突清单知情裁决）。
 */
export function switchBlockedReason(view: GitBranchesView | null, locked: boolean, runningCount: number, branch: string): string | null {
  if (locked) return copy.branch.lockReason(runningCount);
  const occupant = (view?.worktrees ?? []).find((ref) => ref.branch === branch);
  if (occupant !== undefined) return copy.branch.occupiedBy(occupant.path);
  return null;
}
