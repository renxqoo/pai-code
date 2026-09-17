import type { RuntimeSnapshotView } from '@paiapp/contracts';

import { formatClockTime } from '@/thread/format-clock-time';
import { copy } from '@/strings';
import { cn } from '@/lib/utils';
import { formatUptime, heartbeatLabel, phaseLabel } from '@/screens/runtime-format';
import { RuntimeCard } from '@/screens/runtime-card';
import { RuntimeMetaRow } from '@/screens/runtime-meta-row';

type RuntimeHostCardProps = {
  snapshot: RuntimeSnapshotView
}

/** 相位徽章配色（null = 宿主从未构建，走中性灰）。 */
function phaseChipClassOf(phase: RuntimeSnapshotView['hostPhase']): string {
  if (phase === 'ready') return 'bg-dot-done/10 text-dot-done';
  if (phase === 'starting') return 'bg-dot-active/10 text-dot-active';
  if (phase === 'restarting') return 'bg-spark/10 text-spark';
  if (phase === 'failed') return 'bg-destructive/10 text-destructive';
  return 'bg-muted text-muted-foreground';
}

/** 宿主卡：相位徽章 + 心跳/运行时长/重启/版本/PID 元信息（hostInfo 缺失逐项降级）。 */
function RuntimeHostCard({ snapshot }: RuntimeHostCardProps) {
  const host = snapshot.hostInfo;
  const restarts = snapshot.restarts;
  return (
    <RuntimeCard title={copy.runtime.hostPhase}>
      <div className="flex items-center gap-[8px] pt-[2px] pb-[6px]">
        <span
          className={cn(
            'inline-flex h-[20px] items-center gap-[6px] rounded-full px-[9px] text-[11px] leading-none font-medium select-none',
            phaseChipClassOf(snapshot.hostPhase),
            (snapshot.hostPhase === 'starting' || snapshot.hostPhase === 'restarting') && 'animate-pulse motion-reduce:animate-none',
          )}
        >
          <span aria-hidden="true" className="size-[6px] rounded-full bg-current" />
          {phaseLabel(snapshot.hostPhase)}
        </span>
        {host === null ? <span className="truncate text-[11px] text-muted-foreground">{copy.runtime.hostUnavailable}</span> : null}
      </div>
      <div className="divide-y divide-border/60">
        <RuntimeMetaRow label={copy.runtime.heartbeat}>{heartbeatLabel(snapshot.heartbeatAgeMs)}</RuntimeMetaRow>
        <RuntimeMetaRow label={copy.runtime.uptime}>{formatUptime(host?.uptimeMs ?? null)}</RuntimeMetaRow>
        <RuntimeMetaRow label={copy.runtime.restarts}>
          {restarts.count > 0
            ? `${restarts.count} · ${restarts.lastCause ?? '—'}${restarts.lastAt === null ? '' : ` · ${formatClockTime(restarts.lastAt)}`}`
            : copy.runtime.neverRestarted}
        </RuntimeMetaRow>
        <RuntimeMetaRow label={copy.runtime.versions}>
          {host === null
            ? `Pai ${snapshot.appVersion}`
            : `Pai ${snapshot.appVersion} · Hub ${host.version} · ${copy.runtime.bunLabel} ${host.bunVersion}`}
        </RuntimeMetaRow>
        {host !== null ? <RuntimeMetaRow label={copy.runtime.pidLabel}>{host.pid}</RuntimeMetaRow> : null}
      </div>
    </RuntimeCard>
  );
}

export { RuntimeHostCard };
export type { RuntimeHostCardProps };
