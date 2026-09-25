import type { CSSProperties, ReactNode } from 'react'

import { cn } from 'cn'

import { panelSurfaceClassName } from './panel-styles'

type FloatingPanelProps = {
  /** 面板可访问名（sr-only 标题语义） */
  label: string
  /** 标题栏内容（标题文本） */
  title: ReactNode
  /** 标题行右侧动作槽（按钮等） */
  actions?: ReactNode
  /** 内容区最大高度（px）；缺省不限 */
  maxContentHeight?: number
  /** 底部固定条（不随内容滚动，如运行状态条） */
  footer?: ReactNode
  children: ReactNode
  className?: string
}

/**
 * 常驻浮层容器：大圆角 + 描边 + 柔和阴影（与 AnchoredPanel 弹层同观感 token）；
 * 位置与宽度由调用方决定，容器只负责外观、标题栏、内容区内滚与底部固定条。
 */
function FloatingPanel({ label, title, actions, maxContentHeight, footer, children, className }: FloatingPanelProps) {
  const contentStyle: CSSProperties = maxContentHeight === undefined ? {} : { maxHeight: maxContentHeight }
  return (
    <section aria-label={label} className={cn(panelSurfaceClassName, 'flex flex-col overflow-hidden', className)}>
      <header className="flex h-11 shrink-0 items-center gap-2 border-b border-border px-3.5">
        <h2 className="min-w-0 flex-1 truncate text-[13px] font-medium text-foreground">{title}</h2>
        {actions}
      </header>
      <div style={contentStyle} className="min-h-0 min-w-0 overflow-y-auto overscroll-contain">
        {children}
      </div>
      {footer !== undefined && <div className="shrink-0 border-t border-border">{footer}</div>}
    </section>
  )
}

export { FloatingPanel }
export type { FloatingPanelProps }
