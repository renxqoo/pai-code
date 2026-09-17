import type { HostInfoView } from '@paiapp/contracts';

import { copy } from '@/strings';
import { cn } from '@/lib/utils';
import { formatBytes } from '@/screens/runtime-format';
import { RuntimeCard } from '@/screens/runtime-card';
import { RuntimeMetaRow } from '@/screens/runtime-meta-row';

type RuntimeCapacityCardProps = {
  /** hub thread 计数（hostInfo 缺失时 null，分布区降级）；live 数同时用于容量上限比。 */
  threads: HostInfoView['threads'] | null
  /** worker 表行数（含表外会话，观察面比 hub 计数更全）。 */
  workerCount: number
  keepaliveCount: number
  limits: HostInfoView['limits'] | null
}

const distributionTone = {
  live: 'bg-dot-active',
  parked: 'bg-muted-foreground/35',
  dead: 'bg-destructive',
} as const;

/** 容量卡：live/parked/dead 分布 + 常驻数 + 线程上限（n/N）与 RSS 回收阈值（0 = 未启用）。 */
function RuntimeCapacityCard({ threads, workerCount, keepaliveCount, limits }: RuntimeCapacityCardProps) {
  const live = threads?.live ?? 0;
  const parked = threads?.parked ?? 0;
  const dead = threads?.dead ?? 0;
  const distribution = [
    { key: 'live' as const, count: live, label: copy.runtime.stateLive },
    { key: 'parked' as const, count: parked, label: copy.runtime.parked },
    { key: 'dead' as const, count: dead, label: copy.runtime.dead },
  ];
  const total = Math.max(1, live + parked + dead);
  return (
    <RuntimeCard title={copy.runtime.capacity} action={
      <span className="shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">
        {limits === null ? `${workerCount}` : `${live} / ${limits.maxThreads}`}
      </span>
    }>
      {threads === null ? (
        <p className="py-[14px] text-[11.5px] text-muted-foreground">{copy.runtime.hostUnavailable}</p>
      ) : (
        <>
          <div className="flex h-[6px] w-full gap-[2px] overflow-hidden rounded-full" aria-hidden="true">
            {distribution.map((entry) =>
              entry.count > 0 ? (
                <span
                  key={entry.key}
                  className={cn('h-full rounded-full', distributionTone[entry.key])}
                  style={{ width: `${(entry.count / total) * 100}%` }}
                />
              ) : null,
            )}
          </div>
          <div className="flex items-start justify-between gap-[8px] pt-[8px]">
            {distribution.map((entry) => (
              <span key={entry.key} className="flex min-w-0 flex-col items-center gap-[3px]">
                <span className="text-[16px] leading-none font-semibold tabular-nums text-foreground">{entry.count}</span>
                <span className="flex items-center gap-[4px] text-[10.5px] leading-none whitespace-nowrap text-muted-foreground">
                  <span aria-hidden="true" className={cn('size-[5px] rounded-full', distributionTone[entry.key])} />
                  {entry.label}
                </span>
              </span>
            ))}
          </div>
        </>
      )}
      <div className="divide-y divide-border/60 pt-[6px]">
        <RuntimeMetaRow label={copy.runtime.keepaliveOn}>{keepaliveCount}</RuntimeMetaRow>
        <RuntimeMetaRow label={copy.runtime.rssRetireLimit}>
          {limits === null ? '—' : limits.rssRetireBytes > 0 ? formatBytes(limits.rssRetireBytes) : copy.runtime.rssRetireOff}
        </RuntimeMetaRow>
      </div>
    </RuntimeCard>
  );
}

export { RuntimeCapacityCard };
export type { RuntimeCapacityCardProps };
