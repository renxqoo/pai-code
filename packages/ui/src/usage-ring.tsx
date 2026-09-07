import { cn } from 'cn'

const RADIUS = 7.5
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

type UsageRingProps = {
  /** 已用量占比 0..1，超出区间按边界处理 */
  value: number
  size?: number
  className?: string
}

/** 上下文用量环：底环 + 从 12 点方向顺时针的已用弧段。 */
function UsageRing({ value, size = 17, className }: UsageRingProps) {
  const ratio = Math.min(1, Math.max(0, value))
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

export { UsageRing }
export type { UsageRingProps }
