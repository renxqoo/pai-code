import * as React from 'react';

type FieldLabelProps = {
  label: string
  /** 弱化补充说明（可选）；与 label 同行折行展示。 */
  hint?: string
  /** 关联控件 id；省略时渲染为纯文本（非表单控件如分段控件用）。 */
  htmlFor?: string
};

/** 表单字段标签行：主标签 + 可选 hint（设置页各表单共用）。 */
function FieldLabel({ label, hint, htmlFor }: FieldLabelProps): React.JSX.Element {
  return (
    <div className="flex flex-wrap items-baseline gap-x-[8px] gap-y-[2px]">
      {htmlFor === undefined ? (
        <span className="text-[13px] leading-[18px] font-medium text-foreground">{label}</span>
      ) : (
        <label htmlFor={htmlFor} className="text-[13px] leading-[18px] font-medium text-foreground">
          {label}
        </label>
      )}
      {hint === undefined ? null : <span className="min-w-0 text-[11px] leading-[15px] text-muted-foreground">{hint}</span>}
    </div>
  );
}

export { FieldLabel };
export type { FieldLabelProps };
