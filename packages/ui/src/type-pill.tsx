import { cn } from 'cn'

type TypePillProps = {
  label: string
  className?: string
}

/** 类型胶囊：子代理类型标记（Explore / general-purpose）。 */
function TypePill({ label, className }: TypePillProps) {
  return (
    <span
      className={cn(
        'inline-flex h-[17px] shrink-0 items-center rounded-[5px] border border-border px-[5px] font-mono text-[10.5px] leading-none text-muted-foreground',
        className,
      )}
    >
      {label}
    </span>
  )
}

export { TypePill }
export type { TypePillProps }
