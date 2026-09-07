import { cn } from 'cn'

export type StatusDotTone = 'active' | 'done' | 'idle'

const toneClassName: Record<StatusDotTone, string> = {
  active: 'bg-dot-active',
  done: 'bg-dot-done',
  idle: 'bg-muted-foreground/35',
}

type StatusDotProps = {
  tone: StatusDotTone
  className?: string
}

/** 状态点：进行中 / 已完成 / 闲置三态，通知条、面板列表与面板汇总共用。 */
function StatusDot({ tone, className }: StatusDotProps) {
  return (
    <span
      aria-hidden="true"
      className={cn('block size-[7px] shrink-0 rounded-full', toneClassName[tone], className)}
    />
  )
}

export { StatusDot }
export type { StatusDotProps }
