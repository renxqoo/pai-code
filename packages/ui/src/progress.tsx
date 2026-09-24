import { cn } from 'cn'

const RADIUS = 7.5
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

type ProgressProps = {
  /** 完成度百分比 0..100，超出区间按边界处理 */
  value: number
  /** 直径 px（紧凑控件默认 16） */
  size?: number
  className?: string
}

/** 环形进度（shadcn Progress 的圆环形态）：底环 + 自 12 点顺时针的已完成弧段。 */
function Progress({ value, size = 16, className }: ProgressProps) {
  const ratio = Math.min(1, Math.max(0, value / 100))
  return (
    <svg
      viewBox="0 0 20 20"
      width={size}
      height={size}
      fill="none"
      role="img"
      className={cn('shrink-0', className)}
    >
      <circle cx="10" cy="10" r={RADIUS} stroke="currentColor" strokeWidth="2" className="opacity-45" />
      <circle
        cx="10"
        cy="10"
        r={RADIUS}
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeDasharray={`${(CIRCUMFERENCE * ratio).toFixed(2)} ${CIRCUMFERENCE.toFixed(2)}`}
        transform="rotate(-90 10 10)"
      />
    </svg>
  )
}

export { Progress }
export type { ProgressProps }
