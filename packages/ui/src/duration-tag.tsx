import type { ReactNode } from 'react'

import { cn } from 'cn'

type DurationTagProps = {
  children: ReactNode
  className?: string
}

/** 耗时标签：等宽 + 表格数字，走表与冻结两种状态共用同一形态。 */
function DurationTag({ children, className }: DurationTagProps) {
  return (
    <span className={cn('shrink-0 font-mono text-[11px] leading-none tabular-nums text-muted-foreground', className)}>
      {children}
    </span>
  )
}

export { DurationTag }
export type { DurationTagProps }
