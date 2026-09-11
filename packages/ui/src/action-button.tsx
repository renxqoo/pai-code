import type { ComponentProps } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from 'cn';

const actionButtonVariants = cva(
  'inline-flex cursor-pointer items-center justify-center rounded-lg outline-none select-none focus-visible:ring-3 focus-visible:ring-ring/50',
  {
    variants: {
      variant: {
        solid: 'bg-foreground font-medium text-background hover:opacity-90 disabled:pointer-events-none disabled:opacity-60',
        outline: 'border border-border text-foreground hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60',
        quiet: 'text-muted-foreground hover:text-foreground disabled:pointer-events-none disabled:opacity-60',
      },
      size: {
        sm: 'h-8 gap-[6px] px-3 text-[12.5px] leading-none',
        md: 'h-9 px-4 text-[13px] leading-none',
      },
    },
    /** 描边/安静形态自成一套尺寸（紧凑内距/字号，均无字重）：与 size 的冲突交给 cn 的
     * tailwind-merge 收敛（后者胜）。leading-none 必须排在 font-size 之后——cn 会把
     * 先于 text-[px] 出现的 leading-* 当冲突项删掉。 */
    compoundVariants: [{ variant: ['outline', 'quiet'], class: 'gap-[6px] px-3 text-[12.5px] leading-none' }],
    defaultVariants: { variant: 'solid', size: 'md' },
  },
);

type ActionButtonProps = ComponentProps<'button'> & VariantProps<typeof actionButtonVariants>;

/** 表单/列表头操作按钮：实心墨色（保存、新建、重跑引导）、描边（探活、添加模型）与
 * 安静文字（取消，弱化勿点引导）三形态；sm = 列表头紧凑（可带图标），md = 表单行。
 * 文案/图标由调用方以 children 注入。 */
function ActionButton({ className, variant, size, ...props }: ActionButtonProps) {
  return <button data-slot="action-button" className={cn(actionButtonVariants({ variant, size }), className)} {...props} />;
}

export { ActionButton, actionButtonVariants };
export type { ActionButtonProps };
