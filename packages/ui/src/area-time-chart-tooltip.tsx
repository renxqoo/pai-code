import { cn } from 'cn'

type TooltipEntry = {
  dataKey?: string | number
  name?: string | number
  value?: number | string | ReadonlyArray<number | string>
  color?: string
}

type AreaTimeChartTooltipProps = {
  /** recharts 注入：是否处于激活态（无悬停时外层本就不渲染） */
  active?: boolean
  label?: string | number
  payload?: ReadonlyArray<TooltipEntry>
  /** 数值格式化（dataKey 用于区分不同量纲的系列） */
  formatValue?: (value: number, dataKey: string) => string
  /** x 轴标签格式化 */
  formatLabel?: (value: number) => string
  className?: string
}

/** 数值收窄：recharts 的 value 可能是数组（堆叠），本图表只产生标量，垃圾输入回落 0。 */
function numericValue(value: TooltipEntry['value']): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  return 0
}

/** 时间序列图表的悬停读数卡：系列色点 + 名称 + 格式化数值，顶部为 x 轴标签。 */
function AreaTimeChartTooltip({ active, label, payload, formatValue, formatLabel, className }: AreaTimeChartTooltipProps) {
  if (active !== true || payload === undefined || payload.length === 0) return null
  return (
    <div
      className={cn(
        'min-w-[128px] rounded-[10px] border border-border bg-popover/95 px-[10px] py-[8px] text-[11.5px] leading-[16px] shadow-[0_8px_20px_-10px_rgba(24,24,28,0.35)] backdrop-blur-sm',
        className,
      )}
    >
      {typeof label === 'number' && formatLabel !== undefined ? (
        <p className="pb-[4px] font-mono tabular-nums text-muted-foreground">{formatLabel(label)}</p>
      ) : null}
      <div className="flex flex-col gap-[3px]">
        {payload.map((entry) => {
          const dataKey = entry.dataKey === undefined ? '' : `${entry.dataKey}`
          const name = entry.name === undefined ? dataKey : `${entry.name}`
          return (
            <div key={dataKey} className="flex items-center gap-[6px]">
              <span aria-hidden="true" className="size-[7px] shrink-0 rounded-full" style={{ backgroundColor: entry.color }} />
              <span className="min-w-0 flex-1 truncate text-popover-foreground">{name}</span>
              <span className="shrink-0 font-mono tabular-nums text-muted-foreground">
                {formatValue === undefined ? numericValue(entry.value) : formatValue(numericValue(entry.value), dataKey)}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export { AreaTimeChartTooltip }
export type { AreaTimeChartTooltipProps }
