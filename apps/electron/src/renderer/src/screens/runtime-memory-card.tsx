import type { ResourceSampleView } from '@paiapp/contracts';

import { copy } from '@/strings';
import { cn } from '@/lib/utils';
import { formatBytes, processMemorySegments, systemMemoryPressure } from '@/screens/runtime-format';
import { MemoryLegend } from '@/screens/runtime-memory-legend';
import { RuntimeCard } from '@/screens/runtime-card';
import { RuntimeMetaRow } from '@/screens/runtime-meta-row';

type RuntimeMemoryCardProps = {
  latest: ResourceSampleView | null
}

const segmentTone = {
  app: 'bg-dot-active',
  hub: 'bg-dot-done',
  workers: 'bg-spark',
} as const;

/** 内存卡：系统内存压力条 + App/Hub/Workers 三段进程内存 + CPU 合计。 */
function RuntimeMemoryCard({ latest }: RuntimeMemoryCardProps) {
  const pressure = systemMemoryPressure(latest);
  const segments = processMemorySegments(latest);
  const systemTotal = latest?.systemTotalBytes ?? null;
  const systemUsed =
    systemTotal !== null && latest !== null && latest.systemAvailableBytes !== null ? systemTotal - latest.systemAvailableBytes : null;
  const cpu = latest === null ? null : cpuTotal(latest);
  return (
    <RuntimeCard title={copy.runtime.memory}>
      <div className="flex flex-col gap-[4px] pt-[2px]">
        <div className="flex items-baseline justify-between gap-[8px]">
          <span className="text-[11.5px] leading-none text-muted-foreground">{copy.runtime.systemMemory}</span>
          <span className="font-mono text-[11.5px] leading-none tabular-nums text-foreground">
            {systemUsed === null || systemTotal === null ? '—' : `${formatBytes(systemUsed)} / ${formatBytes(systemTotal)}`}
          </span>
        </div>
        <div className="h-[6px] w-full overflow-hidden rounded-full bg-muted" aria-hidden="true">
          {pressure === null ? null : (
            <span
              className={cn(
                'block h-full rounded-full',
                pressure > 0.9 ? 'bg-destructive' : pressure > 0.75 ? 'bg-spark' : 'bg-dot-active',
              )}
              style={{ width: `${pressure * 100}%` }}
            />
          )}
        </div>
      </div>
      <div className="pt-[10px]">
        {segments === null ? (
          <p className="py-[8px] text-[11.5px] text-muted-foreground">{copy.runtime.emptyHistory}</p>
        ) : (
          <>
            <div className="flex h-[6px] w-full gap-[2px] overflow-hidden rounded-full" aria-hidden="true">
              <span className={cn('h-full', segmentTone.app)} style={{ width: `${(segments.app / segments.total) * 100}%` }} />
              <span className={cn('h-full', segmentTone.hub)} style={{ width: `${(segments.hub / segments.total) * 100}%` }} />
              <span className={cn('h-full', segmentTone.workers)} style={{ width: `${(segments.workers / segments.total) * 100}%` }} />
            </div>
            <div className="flex items-start justify-between gap-[8px] pt-[8px]">
              <MemoryLegend tone="app" label={copy.runtime.appMemory} value={formatBytes(segments.app)} />
              <MemoryLegend tone="hub" label={copy.runtime.hubMemory} value={formatBytes(segments.hub)} />
              <MemoryLegend tone="workers" label={copy.runtime.workersMemory} value={formatBytes(segments.workers)} />
            </div>
          </>
        )}
      </div>
      <div className="pt-[6px]">
        <RuntimeMetaRow label={copy.runtime.cpu} className="border-t border-border/60">
          {cpu === null ? '—' : `${cpu.toFixed(1)}%`}
        </RuntimeMetaRow>
      </div>
    </RuntimeCard>
  );
}

/** App + Hub 进程 CPU 合计（worker CPU 主进程不可得）；两侧皆缺时 null。 */
function cpuTotal(latest: ResourceSampleView): number | null {
  if (latest.appCpuPercent === null && latest.hubCpuPercent === null) return null;
  return (latest.appCpuPercent ?? 0) + (latest.hubCpuPercent ?? 0);
}

export { RuntimeMemoryCard };
export type { RuntimeMemoryCardProps };
