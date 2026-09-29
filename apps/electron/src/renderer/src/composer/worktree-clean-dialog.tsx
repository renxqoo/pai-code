import * as React from 'react';
import { AlertTriangle, ChevronDown, ChevronRight } from 'lucide-react';

import type { WorktreeEntryView } from '@paiapp/contracts';

import { copy } from '@/strings';
import { cn } from '@/lib/utils';

type WorktreeCleanDialogProps = {
  readonly entry: WorktreeEntryView
  readonly busy: boolean
  readonly onConfirm: () => void
  readonly onClose: () => void
};

/**
 * worktree 清理确认框（SESSION-WORKTREE-WORKFLOW §1.5 两级呈现）：
 * 主句只讲后果与数量；口径句收折叠详情且条件显示——多轮正确性修补不叠加成
 * git 专家审查面板。locked 树删除按钮前置禁用；unmergedCount>0 才现口径句。
 * 轻量自管开合（与 conflict-files-dialog 同形态）。
 */
function WorktreeCleanDialog({ entry, busy, onConfirm, onClose }: WorktreeCleanDialogProps) {
  const [detailOpen, setDetailOpen] = React.useState(false);
  const branchLabel = entry.branch ?? copy.branch.wtDetachedLabel;
  const unmerged = entry.unmergedCount ?? null;
  const dangerous = unmerged !== null && unmerged > 0;
  const deletable = !busy && entry.locked !== true;
  return (
    <div
      className="fixed inset-0 isolate z-50 flex items-center justify-center bg-black/40 p-6"
      role="dialog"
      aria-modal="true"
      aria-label={copy.branch.wtCleanTitle}
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-border bg-popover p-5 shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center gap-2">
          <AlertTriangle aria-hidden="true" className={cn('size-4 shrink-0', dangerous ? 'text-destructive' : 'text-amber-500')} strokeWidth={1.75} />
          <h2 className="text-sm font-semibold text-foreground">{copy.branch.wtCleanTitle}</h2>
        </div>
        <p className={cn('mt-2 text-sm leading-5', dangerous ? 'text-destructive' : 'text-foreground')}>
          {copy.branch.wtCleanMain(branchLabel, unmerged)}
        </p>
        {entry.prunable === true ? <p className="mt-2 text-xs leading-4 text-muted-foreground">{copy.branch.wtPrunableNote}</p> : null}
        {entry.locked === true ? <p className="mt-2 text-xs leading-4 text-muted-foreground">{copy.branch.wtLockedNote}</p> : null}
        {dangerous ? (
          <div className="mt-2">
            <button
              type="button"
              className="flex items-center gap-1 text-xs text-muted-foreground underline underline-offset-2 outline-none hover:text-foreground"
              onClick={() => { setDetailOpen((v) => !v); }}
            >
              {detailOpen ? <ChevronDown aria-hidden="true" className="size-3" /> : <ChevronRight aria-hidden="true" className="size-3" />}
              {copy.branch.wtCleanDetail}
            </button>
            {detailOpen ? <p className="mt-1 rounded-lg bg-muted px-2 py-1.5 text-xs leading-4 text-muted-foreground">{copy.branch.wtCleanSquashNote}</p> : null}
          </div>
        ) : null}
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            className="h-8 cursor-pointer rounded-md border border-border px-3 text-xs text-foreground outline-none hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50"
            onClick={onClose}
          >
            {copy.gitGraph.close}
          </button>
          <button
            type="button"
            disabled={!deletable}
            className={cn(
              'h-8 cursor-pointer rounded-md px-3 text-xs text-white outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
              dangerous ? 'bg-destructive hover:bg-destructive/90' : 'bg-foreground hover:bg-foreground/90',
              !deletable && 'cursor-not-allowed opacity-50',
            )}
            onClick={onConfirm}
          >
            {copy.branch.wtCleanProceed}
          </button>
        </div>
      </div>
    </div>
  );
}

export { WorktreeCleanDialog };
export type { WorktreeCleanDialogProps };
