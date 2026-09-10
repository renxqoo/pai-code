import type { ResourceSampleView } from '@paiapp/contracts';
import { AreaTimeChart, type AreaTimeChartSeries } from '@paiapp/ui';

import { formatClockTime } from '@/thread/format-clock-time';
import { copy } from '@/strings';
import { formatGigabytes, formatMegabytes, toResourceChartPoints } from '@/screens/runtime-format';
import { RuntimeCard } from '@/screens/runtime-card';

type RuntimeTrendCardProps = {
  history: ReadonlyArray<ResourceSampleView>
}

/** 系列配色（app 主题 token）：进程内存三色 + 系统内存中性灰；标签随渲染取当前 locale。 */
function seriesOf(): readonly AreaTimeChartSeries[] {
  return [
    { dataKey: 'app', label: copy.runtime.appMemory, color: 'var(--dot-active)' },
    { dataKey: 'hub', label: copy.runtime.hubMemory, color: 'var(--dot-done)' },
    { dataKey: 'workers', label: copy.runtime.workersMemory, color: 'var(--spark)' },
    { dataKey: 'system', label: copy.runtime.systemMemory, color: 'var(--chart-3)', axis: 'right' },
  ];
}

/** 资源走势卡：近 30 分钟 App/Hub/Workers 内存（MB）+ 系统内存（GB，右轴）。 */
function RuntimeTrendCard({ history }: RuntimeTrendCardProps) {
  const points = toResourceChartPoints(history);
  const series = seriesOf();
  return (
    <RuntimeCard
      title={copy.runtime.resourceTrend}
      action={
        <span className="flex shrink-0 items-center gap-[10px]">
          {series.map((serie) => (
            <span key={serie.dataKey} className="flex items-center gap-[4px] text-[10.5px] leading-none text-muted-foreground">
              <span aria-hidden="true" className="size-[6px] rounded-full" style={{ backgroundColor: serie.color }} />
              {serie.label}
            </span>
          ))}
        </span>
      }
    >
      {points.length === 0 ? (
        <p className="py-[36px] text-center text-[11.5px] text-muted-foreground">{copy.runtime.emptyHistory}</p>
      ) : (
        <AreaTimeChart
          series={series}
          data={points}
          xDataKey="at"
          height={150}
          formatValue={(value, dataKey) => (dataKey === 'system' ? formatGigabytes(value) : formatMegabytes(value))}
          formatX={formatClockTime}
          aria-label={copy.runtime.resourceTrend}
        />
      )}
    </RuntimeCard>
  );
}

export { RuntimeTrendCard };
export type { RuntimeTrendCardProps };
