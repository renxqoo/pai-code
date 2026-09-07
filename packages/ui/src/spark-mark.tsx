import { cn } from 'cn'

import { SPARK_RAYS } from './spark-geometry'

/** 品牌光刺（12 芒星）：会话卡的工作中标记与模型标识共用同一图形。 */
function SparkMark({ className, size = 14 }: { className?: string; size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      aria-hidden="true"
      className={cn('shrink-0', className)}
    >
      {SPARK_RAYS.map((d) => (
        <path key={d} d={d} stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" />
      ))}
    </svg>
  )
}

export { SparkMark }
