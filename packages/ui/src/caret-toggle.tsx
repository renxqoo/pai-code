import { cn } from 'cn'

type CaretToggleProps = {
  open: boolean
  className?: string
}

/** 实心小三角指示器：面板项「▸ 工具名」一类的展开标记，展开时转向下方。 */
function CaretToggle({ open, className }: CaretToggleProps) {
  return (
    <svg
      viewBox="0 0 8 10"
      fill="currentColor"
      aria-hidden="true"
      className={cn(
        'h-[9px] w-[7px] shrink-0 text-muted-foreground transition-transform duration-150 motion-reduce:transition-none',
        open ? 'rotate-90' : 'rotate-0',
        className,
      )}
    >
      <path d="M1.4 0.7 7.4 5 1.4 9.3Z" />
    </svg>
  )
}

export { CaretToggle }
export type { CaretToggleProps }
