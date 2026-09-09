import { GitBranchPlus } from 'lucide-react';

import type { GitBranchesView } from '@paiapp/contracts';

import { PickerDialog } from '@/components/picker-dialog';
import { Button } from '@/components/ui/button';
import { copy } from '@/strings';

type BranchPickerDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** 分支视图（null = 加载中/失败，按 loading/failed 给空态文案） */
  view: GitBranchesView | null
  loading: boolean
  failed: boolean
  onSelect: (branch: string) => void
  /** 打开「创建并检出」弹窗 */
  onCreate: () => void
  /** 检出在途：入口禁用 */
  busy: boolean
}

/** 分支选择弹窗：搜索本地分支（当前分支打勾）+ 创建并检出入口。 */
function BranchPickerDialog({ open, onOpenChange, view, loading, failed, onSelect, onCreate, busy }: BranchPickerDialogProps) {
  const items = (view?.branches ?? []).map((branch) => ({ id: branch, label: branch }));
  const emptyLabel = loading ? copy.newTask.branchLoading : failed ? copy.newTask.branchUnavailable : copy.newTask.branchEmpty;
  return (
    <PickerDialog
      open={open}
      onOpenChange={onOpenChange}
      title={copy.newTask.branchPickerTitle}
      searchPlaceholder={copy.newTask.branchSearch}
      emptyLabel={emptyLabel}
      groups={[{ items }]}
      selectedId={view?.current ?? null}
      onSelect={onSelect}
      footer={
        <div className="mt-1 border-t p-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="w-full justify-start gap-2"
            onClick={onCreate}
            disabled={busy || view === null || !view.isRepo}
          >
            <GitBranchPlus />
            {copy.newTask.createBranch}
          </Button>
        </div>
      }
    />
  );
}

export { BranchPickerDialog };
export type { BranchPickerDialogProps };
