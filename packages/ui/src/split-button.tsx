import type { ReactNode } from 'react'

import { cn } from 'cn'

import { MenuButton } from './menu-button'

type SplitButtonProps = {
  label: string
  icon?: ReactNode
  onClick?: () => void
  menuItems?: readonly string[]
  onMenuSelect?: (label: string) => void
  className?: string
}

/**
 * 一体两段的主操作按钮：主段执行默认动作，副段（下拉箭头）展开选项；
 * 两段共用一枚胶囊外框，中缝为细分隔线。
 */
function SplitButton({ label, icon, onClick, menuItems, onMenuSelect, className }: SplitButtonProps) {
  return (
    <div
      className={cn(
        'inline-flex h-[23px] items-center rounded-full border border-border bg-background text-foreground transition-colors hover:bg-accent/60 focus-within:ring-3 focus-within:ring-ring/50',
        className,
      )}
    >
      <button
        type="button"
        onClick={onClick}
        className="flex h-full cursor-pointer items-center gap-[6px] rounded-l-full py-0 pr-[6px] pl-[8px] text-[11.5px] leading-none font-medium outline-none select-none [&_svg:not([class*='size-'])]:size-3 [&_svg]:text-muted-foreground"
      >
        {icon}
        {label}
      </button>
      {menuItems === undefined ? null : (
        <>
          <span aria-hidden="true" className="h-full w-px shrink-0 bg-border" />
          <MenuButton
            aria-label={label}
            align="end"
            popupMinWidth={168}
            items={menuItems.map((item) => ({ kind: 'item' as const, id: item, label: item }))}
            onSelect={onMenuSelect}
            triggerClassName="flex h-full cursor-pointer items-center rounded-r-full px-[7px] text-muted-foreground transition-colors outline-none hover:bg-accent aria-expanded:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50 [&_svg:not([class*='size-'])]:size-3"
            trigger={
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className="size-3">
                <path
                  d="m6 9 6 6 6-6"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            }
          />
        </>
      )}
    </div>
  )
}

export { SplitButton }
export type { SplitButtonProps }
