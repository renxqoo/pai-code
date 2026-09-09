import { Command, CommandDialog, CommandInput, CommandList } from '@/components/ui/command';

import { PickerDialogItems } from './picker-dialog-items';
import type { PickerDialogGroup } from './picker-dialog-types';

type PickerDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** 对话框可访问名（sr-only 标题） */
  title: string
  searchPlaceholder: string
  emptyLabel: string
  groups: readonly PickerDialogGroup[]
  selectedId: string | null
  /** 选中即回调；关闭经 onOpenChange(false) 交调用方收口 */
  onSelect: (id: string) => void
};

/**
 * 通用选择弹窗：居中模态 + 顶部搜索（自动聚焦）+ 分组列表 + 键盘上下/回车选择（cmdk 内建），
 * Esc / 点遮罩关闭（Base UI Dialog 默认）。关态不渲染任何面板内容。
 * 关 = 卸载（早退 null）是刻意行为：cmdk 搜索词随卸载重置，重新打开呈现全量列表；
 * 代价是退出过渡动画不做（生成物 CommandDialog 的 sr-only 标题在 Portal 外，若改为
 * 常挂载由 open 控制会污染关态 DOM，权衡后保关态零渲染）。defaultValue 让初始键盘
 * 高亮落在当前选中项——打开即回车不会误提交目录首项。
 */
function PickerDialog({ open, onOpenChange, title, searchPlaceholder, emptyLabel, groups, selectedId, onSelect }: PickerDialogProps) {
  if (!open) return null;
  const pick = (id: string): void => {
    onSelect(id);
    onOpenChange(false);
  };
  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} title={title} description={searchPlaceholder}>
      {/* label 覆盖 cmdk 内建英文可访问名（"Suggestions"），名单面无访问名统一用 title */}
      <Command label={title} defaultValue={selectedId ?? undefined}>
        <CommandInput placeholder={searchPlaceholder} />
        <CommandList label={title}>
          <PickerDialogItems groups={groups} selectedId={selectedId} emptyLabel={emptyLabel} onSelect={pick} />
        </CommandList>
      </Command>
    </CommandDialog>
  );
}

export { PickerDialog };
export type { PickerDialogProps };
