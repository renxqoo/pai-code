import { useId } from 'react'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

import { cn } from 'cn'

import { AreaTimeChartTooltip } from './area-time-chart-tooltip'

export type AreaTimeChartSeries = {
  /** 数据点位中的字段名 */
  dataKey: string
  /** 图例与悬停读数中的系列名 */
  label: string
  /** 描边与渐变主色（推荐 token，如 var(--chart-2)） */
  color: string
  /** 挂靠轴：缺省 left；量纲悬殊的第二组系列挂 right（刻度隐藏，只经读数卡取值） */
  axis?: 'left' | 'right'
}

type AreaTimeChartProps = {
  series: readonly AreaTimeChartSeries[]
  /** 数据点位：缺失的系列值为 null（画断线，不连零） */
  data: ReadonlyArray<Record<string, number | null>>
  xDataKey: string
  'aria-label': string
  height?: number
  /** 数值格式化：y 轴刻度与悬停读数共用（dataKey 用于区分量纲） */
  formatValue?: (value: number, dataKey: string) => string
  /** x 轴（时间戳）刻度格式化 */
  formatX?: (value: number) => string
  className?: string
}

/** 时间序列面积图（recharts 封装）：多系列 + 渐变填充 + token 化配色；
 * 数值断点连成断线；悬停读数卡走 AreaTimeChartTooltip。 */
function AreaTimeChart({ series, data, xDataKey, 'aria-label': ariaLabel, height = 180, formatValue, formatX, className }: AreaTimeChartProps) {
  const gradientId = useId()
  const hasRightAxis = series.some((serie) => serie.axis === 'right')
  const tickFormatter = formatValue === undefined ? undefined : (value: number): string => formatValue(value, '')
  return (
    <div
      role="img"
      aria-label={ariaLabel}
      className={cn('w-full text-muted-foreground select-none', className)}
    >
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart data={data as never} margin={{ top: 6, right: 4, bottom: 0, left: 0 }}>
          <defs>
            {series.map((serie) => (
              <linearGradient key={serie.dataKey} id={`${gradientId}-${serie.dataKey}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={serie.color} stopOpacity={0.28} />
                <stop offset="100%" stopColor={serie.color} stopOpacity={0.02} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 4" />
          <XAxis
            dataKey={xDataKey}
            type="number"
            domain={['dataMin', 'dataMax']}
            tickFormatter={formatX}
            tick={{ fontSize: 10.5 }}
            tickLine={false}
            axisLine={false}
            tickMargin={6}
            minTickGap={56}
            stroke="currentColor"
          />
          <YAxis
            width={52}
            tickFormatter={tickFormatter}
            tick={{ fontSize: 10.5 }}
            tickLine={false}
            axisLine={false}
            tickCount={4}
            stroke="currentColor"
          />
          {hasRightAxis ? <YAxis yAxisId="right" orientation="right" hide /> : null}
          <Tooltip
            cursor={{ stroke: 'var(--muted-foreground)', strokeOpacity: 0.35, strokeDasharray: '3 3' }}
            content={<AreaTimeChartTooltip formatValue={formatValue} formatLabel={formatX} />}
            isAnimationActive={false}
          />
          {series.map((serie) => (
            <Area
              key={serie.dataKey}
              dataKey={serie.dataKey}
              name={serie.label}
              type="monotone"
              yAxisId={serie.axis === 'right' ? 'right' : undefined}
              stroke={serie.color}
              strokeWidth={1.5}
              fill={`url(#${gradientId}-${serie.dataKey})`}
              connectNulls={false}
              dot={false}
              activeDot={{ r: 2.5, strokeWidth: 0 }}
              isAnimationActive={false}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

export { AreaTimeChart }
export type { AreaTimeChartProps }
