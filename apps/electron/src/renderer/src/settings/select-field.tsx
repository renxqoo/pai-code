import * as React from 'react';
import { ChevronDown } from 'lucide-react';

import { MenuButton, selectTriggerClassName } from '@paiapp/ui';

import { FieldLabel } from './field-label';

type SelectFieldOption<T extends string = string> = { id: T; label: string };

type SelectFieldProps<T extends string = string> = {
  label: string
  value: T
  options: readonly SelectFieldOption<T>[]
  onChange: (id: T) => void
  /** 控件下方补充说明（弱化）。 */
  hint?: string
  popupMinWidth?: number
};

/** 通用单选字段：label + 下拉触发器（MenuButton）+ hint；值/选项由调用方归一。 */
function SelectField<T extends string>({ label, value, options, onChange, hint, popupMinWidth }: SelectFieldProps<T>): React.JSX.Element {
  const selected = options.find((option) => option.id === value);
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-[6px]">
      <FieldLabel label={label} />
      <MenuButton
        aria-label={label}
        align="start"
        popupMinWidth={popupMinWidth}
        items={options.map((option) => ({ kind: 'item' as const, id: option.id, label: option.label, selected: option.id === value }))}
        // 选中项来自本组件渲染的选项表，回调 id 必属 T
        onSelect={(id) => onChange(id as T)}
        triggerClassName={`${selectTriggerClassName} w-full`}
        trigger={
          <>
            <span className="min-w-0 flex-1 truncate">{selected?.label ?? value}</span>
            <ChevronDown className="size-3 shrink-0 text-muted-foreground/70" strokeWidth={2} />
          </>
        }
      />
      {hint === undefined ? null : <p className="text-[11px] leading-[15px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

export { SelectField };
export type { SelectFieldOption, SelectFieldProps };
