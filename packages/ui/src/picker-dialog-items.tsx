import { Check } from 'lucide-react';

import { CommandEmpty, CommandGroup, CommandItem } from './command';

import type { PickerDialogGroup } from './picker-dialog-types';

type PickerDialogItemsProps = {
  groups: readonly PickerDialogGroup[]
  selectedId: string | null
  emptyLabel: string
  onSelect: (id: string) => void
};

/** 生成物 CommandItem 末位自带 data-checked 控制的勾选 svg（本选择器不使用该机制），整行隐藏之。 */
const ITEM_CLASS_NAME = '[&>svg:last-child]:hidden';

/** 选择弹窗的列表内容：空态文案 + 分组条目（勾选标记 = 当前选中项）；必须置于 Command 内渲染。 */
function PickerDialogItems({ groups, selectedId, emptyLabel, onSelect }: PickerDialogItemsProps) {
  return (
    <>
      <CommandEmpty>{emptyLabel}</CommandEmpty>
      {groups.map((group, groupIndex) => {
        if (group.items.length === 0) return null;
        return (
          <CommandGroup key={groupIndex} heading={group.heading}>
            {group.items.map((item) => (
              <CommandItem
                key={item.id}
                value={item.id}
                keywords={[item.label]}
                /* 展示 label 去了 provider 前缀，访问名补全完整 id（对齐旧菜单的可听性） */
                aria-label={item.id}
                onSelect={() => onSelect(item.id)}
                className={ITEM_CLASS_NAME}
              >
                <span className="min-w-0 truncate">{item.label}</span>
                {item.detail === undefined ? null : (
                  <span className="min-w-0 truncate text-xs text-muted-foreground">{item.detail}</span>
                )}
                {item.id === selectedId ? (
                  <Check aria-hidden="true" className="ml-auto size-3.5 shrink-0 text-muted-foreground" />
                ) : null}
              </CommandItem>
            ))}
          </CommandGroup>
        );
      })}
    </>
  );
}

export { PickerDialogItems };
