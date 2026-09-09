import { FolderOpen } from 'lucide-react';

import { ToggleSwitch } from '@paiapp/ui';

import { PickerDialog } from '@/components/picker-dialog';
import { Button } from '@/components/ui/button';
import { workspaceItems } from '@/screens/new-task-view-model';
import { copy } from '@/strings';

type WorkspacePickerDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** 已知项目目录（最近优先） */
  dirs: readonly string[]
  selectedCwd: string
  onSelect: (cwd: string) => void
  /** 信任开关（随本次会话创建透传 trusted） */
  trusted: boolean
  onTrustedChange: (trusted: boolean) => void
  /** 系统文件夹选择器（取消/失败返回 null） */
  onOpenFolder: () => void
  /** 选择器在途：入口按钮禁用 */
  picking: boolean
}

/** 工作区选择弹窗：搜索已知项目目录 + 打开文件夹 + 信任开关（底部固定动作区）。 */
function WorkspacePickerDialog({
  open,
  onOpenChange,
  dirs,
  selectedCwd,
  onSelect,
  trusted,
  onTrustedChange,
  onOpenFolder,
  picking,
}: WorkspacePickerDialogProps) {
  return (
    <PickerDialog
      open={open}
      onOpenChange={onOpenChange}
      title={copy.newTask.workspacePickerTitle}
      searchPlaceholder={copy.newTask.workspaceSearch}
      emptyLabel={copy.newTask.workspaceEmpty}
      groups={[{ items: workspaceItems(dirs) }]}
      selectedId={selectedCwd}
      onSelect={onSelect}
      footer={
        <div className="mt-1 border-t p-1">
          <label className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 select-none hover:bg-muted/60">
            <ToggleSwitch checked={trusted} onCheckedChange={onTrustedChange} aria-label={copy.newTask.trustedLabel} />
            <span className="text-sm">{copy.newTask.trustedLabel}</span>
          </label>
          <p className="px-2 pb-1 text-xs leading-[16px] text-muted-foreground">{copy.newTask.trustedHint}</p>
          <Button type="button" variant="ghost" size="sm" className="w-full justify-start gap-2" onClick={onOpenFolder} disabled={picking}>
            <FolderOpen />
            {copy.newTask.openFolder}
          </Button>
        </div>
      }
    />
  );
}

export { WorkspacePickerDialog };
export type { WorkspacePickerDialogProps };
