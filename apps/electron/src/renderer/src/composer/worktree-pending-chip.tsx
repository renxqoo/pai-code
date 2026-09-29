import { GitBranch, X } from 'lucide-react';

import { copy } from '@/strings';

type WorktreePendingChipProps = {
  /** 已创建的 worktree 分支（chip 只在有树时由调用方渲染） */
  branch: string
  /** 删除该 worktree 并取消（树必 clean 零提交，remove 门必过） */
  onClear: () => void
};

/** 新建任务页 worktree 树标记（§1.5 弹窗开关创建）：会话将从该树开始，× 删除回滚。 */
function WorktreePendingChip({ branch, onClear }: WorktreePendingChipProps) {
  return (
    <div className="mb-1 flex w-fit items-center gap-1 rounded-full border border-border bg-surface-subtle/70 py-0.5 pl-2 pr-1 text-[11px] leading-4 text-muted-foreground">
      <GitBranch aria-hidden="true" className="size-3 shrink-0" strokeWidth={1.75} />
      <span className="max-w-[240px] truncate">{copy.branch.wtPendingChip(branch)}</span>
      <button
        type="button"
        aria-label={copy.branch.wtPendingClear}
        onClick={onClear}
        className="flex size-4 cursor-pointer items-center justify-center rounded-full outline-none hover:bg-foreground/10 focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <X aria-hidden="true" className="size-3" strokeWidth={2} />
      </button>
    </div>
  );
}

export { WorktreePendingChip };
export type { WorktreePendingChipProps };
