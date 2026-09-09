import * as React from 'react';

import { cn } from '@/lib/utils';

import { FieldLabel } from './field-label';

type TextFieldProps = {
  label: string
  value: string
  onChange: (value: string) => void
  /** 关联 label 与 input；省略时 input 以 aria-label 兜底可访问名。 */
  id?: string
  /** 控件下方补充说明（弱化）。 */
  hint?: string
  placeholder?: string
  disabled?: boolean
  /** 等宽字体（模型 id / 地址类输入）。 */
  mono?: boolean
  autoFocus?: boolean
};

/** 通用文本字段：label + input + hint（设置页表单共用）。 */
function TextField({
  label,
  value,
  onChange,
  id,
  hint,
  placeholder,
  disabled = false,
  mono = false,
  autoFocus = false,
}: TextFieldProps): React.JSX.Element {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-[6px]">
      <FieldLabel label={label} htmlFor={id} />
      <input
        id={id}
        aria-label={id === undefined ? label : undefined}
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        autoFocus={autoFocus}
        className={cn(
          'h-9 w-full min-w-0 rounded-lg border border-border bg-background px-3 text-[13px] leading-[18px] text-foreground outline-none placeholder:text-muted-foreground focus:border-foreground/30 disabled:cursor-not-allowed disabled:opacity-60',
          mono && 'font-mono text-[12.5px]',
        )}
      />
      {hint === undefined ? null : <p className="text-[11px] leading-[15px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

export { TextField };
export type { TextFieldProps };
