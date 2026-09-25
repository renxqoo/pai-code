import type { ReactNode } from 'react'

import { cn } from 'cn'

import { ChevronToggle } from './chevron-toggle'

type CollapsibleSectionProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** 标题行图标（可选） */
  icon?: ReactNode
  /** 标题文本 */
  title: ReactNode
  /** 标题右侧计数/元信息槽（如 `5/5`） */
  meta?: ReactNode
  children: ReactNode
  className?: string
}

/**
 * 通用可折叠分节：整行标题点击收放（chevron 指示 + aria-expanded）；
 * 关 = 内容卸载（不留不可见的可聚焦元素）。
 */
function CollapsibleSection({ open, onOpenChange, icon, title, meta, children, className }: CollapsibleSectionProps) {
  return (
    <section className={cn('min-w-0', className)}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => onOpenChange(!open)}
        className="flex h-8 w-full cursor-pointer items-center gap-1.5 rounded-lg px-1.5 text-left outline-none select-none hover:bg-accent/50 focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <ChevronToggle open={open} />
        {icon !== undefined && <span className="flex shrink-0 items-center text-muted-foreground">{icon}</span>}
        <span className="min-w-0 truncate text-[12px] font-medium text-foreground">{title}</span>
        {meta !== undefined && <span className="shrink-0 text-[11px] text-muted-foreground">{meta}</span>}
      </button>
      {open && <div className="min-w-0">{children}</div>}
    </section>
  )
}

export { CollapsibleSection }
export type { CollapsibleSectionProps }
