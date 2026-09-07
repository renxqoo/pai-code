import { cn } from 'cn'

type ChevronToggleProps = {
  open: boolean
  /** 'disclose'：收合朝右、展开朝下；'reveal'：收合朝下、展开朝上 */
  variant?: 'disclose' | 'reveal'
  className?: string
}

/** 细箭头指示器：随开合状态旋转，只承担视觉指示，交互由调用方承载。 */
function ChevronToggle({ open, variant = 'disclose', className }: ChevronToggleProps) {
  const rotation = variant === 'disclose' ? (open ? 'rotate-0' : '-rotate-90') : open ? '-rotate-180' : 'rotate-0'
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={cn(
        'size-3 shrink-0 text-muted-foreground transition-transform duration-150 motion-reduce:transition-none',
        rotation,
        className,
      )}
    >
      <path d="m6 9 6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export { ChevronToggle }
export type { ChevronToggleProps }
