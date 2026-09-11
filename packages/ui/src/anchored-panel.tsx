import { useEffect, type CSSProperties, type ReactElement, type ReactNode } from 'react';

import { Popover } from '@base-ui/react/popover';

type AnchoredPanelProps = {
  /** 受控开合；点击面板外、Esc、触发器点击都经 Base UI dismiss 汇入此口 */
  open: boolean
  onOpenChange: (open: boolean) => void
  /** 触发器元素：弹层行为（点击开合 / aria-expanded）合并进该元素自身，不额外包一层按钮 */
  trigger: ReactElement
  /** 面板内容 */
  children: ReactNode
  /** 面板可访问名（sr-only 标题） */
  label: string
  /** 面板宽度（px）；默认常规下拉面板宽度（用户裁决：540 → 360 → 280 逐轮收紧定档） */
  width?: number
  /** 弹出侧；默认 top —— 触发器贴屏幕底边时面板从触发器上缘向上弹出 */
  side?: 'top' | 'bottom'
  /** 水平对齐（相对触发器） */
  align?: 'start' | 'center' | 'end'
  /** 面板与触发器的间距（px） */
  sideOffset?: number
};

/** 面板容器外观：大圆角 + 描边 + 柔和阴影，开合走 scale/opacity 过渡（与 Menu 族同一观感）。 */
const popupClassName =
  'z-50 box-border origin-[var(--transform-origin)] overflow-hidden rounded-2xl border border-border bg-popover text-popover-foreground shadow-lg shadow-black/5 outline-none data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0 transition-[opacity,scale] data-[starting-style]:duration-100 data-[ending-style]:duration-75';

/**
 * 通用锚定面板：受控弹出的非模态面板，锚定在触发器旁。非模态语义（modal=false）——
 * 不锁滚动、不 inert 外部内容，点击面板外由 Base UI dismiss 关闭；打开时焦点进入面板内
 * 第一个可聚焦元素（Base UI 默认），关闭后焦点归还触发器。
 * 关 = 卸载（Portal，keepMounted 默认关）：面板内容本地态（如搜索词）随开合重置。
 * 窗口失焦（切走应用）同步收起，避免回到应用后面板仍悬挂遮挡（与 MenuButton 同一约束）。
 */
function AnchoredPanel({ open, onOpenChange, trigger, children, label, width = 280, side = 'top', align = 'start', sideOffset = 8 }: AnchoredPanelProps) {
  useEffect(() => {
    if (!open) return;
    const close = (): void => onOpenChange(false);
    window.addEventListener('blur', close);
    return () => window.removeEventListener('blur', close);
  }, [open, onOpenChange]);
  return (
    <Popover.Root open={open} onOpenChange={onOpenChange} modal={false}>
      <Popover.Trigger render={trigger} />
      <Popover.Portal>
        <Popover.Positioner side={side} align={align} sideOffset={sideOffset} className="z-50 outline-none">
          <Popover.Popup style={{ width } satisfies CSSProperties} className={popupClassName}>
            <Popover.Title className="sr-only">{label}</Popover.Title>
            {children}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

export { AnchoredPanel };
export type { AnchoredPanelProps };
