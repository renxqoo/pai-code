import * as React from 'react';

import { Recycle } from 'lucide-react';

import type { IdleRecycleMinutes } from '@paiapp/contracts';
import { IDLE_RECYCLE_MINUTE_OPTIONS } from '@paiapp/contracts';
import { SegmentedControl, type SegmentedControlOption } from '@paiapp/ui';

import { copy } from '@/strings';
import { cn } from '@/lib/utils';
import type { RuntimeWorkerRow as RuntimeWorkerRowModel } from '@/screens/runtime-entries';
import { isRecyclableIdle, matchesWorkerFilter, type WorkerRowFilter } from '@/screens/runtime-format';
import { RuntimeCard } from '@/screens/runtime-card';
import { RuntimeWorkerRow } from '@/screens/runtime-worker-row';

type RuntimeWorkerTableProps = {
  rows: readonly RuntimeWorkerRowModel[]
  idleRecycleMinutes: IdleRecycleMinutes
  onStop: (threadId: string) => void
  onRetire: (threadId: string) => void
  onForceRetire: (threadId: string) => void
  onToggleKeepalive: (threadId: string, keepalive: boolean) => void
  onOpenSession: (threadId: string) => void
  onSetIdleRecycle: (minutes: IdleRecycleMinutes) => void
  onRecycleAllIdle: () => void
}

const columnClass =
  'px-[8px] py-[7px] text-left text-[10.5px] leading-none font-normal whitespace-nowrap text-muted-foreground';

/** Worker 管理表：筛选分段 + 闲置档位快调 + 回收全部空闲 + 全列状态表（筛选为表内 UI 态）。 */
function RuntimeWorkerTable({
  rows,
  idleRecycleMinutes,
  onStop,
  onRetire,
  onForceRetire,
  onToggleKeepalive,
  onOpenSession,
  onSetIdleRecycle,
  onRecycleAllIdle,
}: RuntimeWorkerTableProps) {
  const [filter, setFilter] = React.useState<WorkerRowFilter>('all');
  const idleRecyclableCount = rows.filter((row) => isRecyclableIdle(row)).length;
  const visible = rows.filter((row) => matchesWorkerFilter(filter, row));
  const filterOptions: ReadonlyArray<SegmentedControlOption<WorkerRowFilter>> = [
    { value: 'all', label: copy.runtime.filterAll },
    { value: 'executing', label: copy.runtime.filterExecuting },
    { value: 'idle', label: copy.runtime.filterIdle },
    { value: 'parked', label: copy.runtime.filterParked },
    { value: 'dead', label: copy.runtime.filterDead },
  ];
  const policyOptions = IDLE_RECYCLE_MINUTE_OPTIONS.map((minutes) => ({ value: minutes, label: copy.runtime.minutesOption(minutes) }));
  return (
    <RuntimeCard
      title={copy.runtime.workersTitle}
      contentClassName="overflow-x-auto"
      action={
        <div className="flex flex-wrap items-center justify-end gap-[8px]">
          <span className="flex items-center gap-[6px]">
            <span className="text-[11px] leading-none text-muted-foreground">{copy.runtime.recyclePolicy}</span>
            <SegmentedControl aria-label={copy.runtime.recyclePolicy} options={policyOptions} value={idleRecycleMinutes} onChange={onSetIdleRecycle} />
          </span>
          <SegmentedControl aria-label={copy.runtime.workersTitle} options={filterOptions} value={filter} onChange={setFilter} />
          <button
            type="button"
            onClick={onRecycleAllIdle}
            disabled={idleRecyclableCount === 0}
            className="flex h-[28px] cursor-pointer items-center gap-[6px] rounded-[8px] border border-border px-[10px] text-[11.5px] leading-none text-foreground outline-none select-none hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Recycle className="size-[12px]" strokeWidth={1.75} />
            {copy.runtime.recycleAllIdle}
          </button>
        </div>
      }
    >
      {rows.length === 0 ? (
        <p className="py-[28px] text-center text-[12px] text-muted-foreground">{copy.runtime.noWorkers}</p>
      ) : visible.length === 0 ? (
        <p className="py-[28px] text-center text-[12px] text-muted-foreground">{copy.sidebar.noMatches}</p>
      ) : (
        <table className="w-full min-w-[760px] border-collapse">
          <thead>
            <tr className="border-b border-border">
              <th className={cn(columnClass, 'min-w-[150px]')}>{copy.runtime.columnSession}</th>
              <th className={columnClass}>{copy.runtime.columnState}</th>
              <th className={columnClass}>{copy.runtime.columnIdle}</th>
              <th className={columnClass}>{copy.runtime.columnModel}</th>
              <th className={cn(columnClass, 'text-right')}>{copy.runtime.columnQueue}</th>
              <th className={cn(columnClass, 'text-right')}>{copy.runtime.columnTokens}</th>
              <th className={cn(columnClass, 'text-right')}>{copy.runtime.columnMemory}</th>
              <th className={cn(columnClass, 'text-right')}>{copy.runtime.columnActions}</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => (
              <RuntimeWorkerRow
                key={row.threadId}
                row={row}
                onStop={onStop}
                onRetire={onRetire}
                onForceRetire={onForceRetire}
                onToggleKeepalive={onToggleKeepalive}
                onOpenSession={onOpenSession}
              />
            ))}
          </tbody>
        </table>
      )}
    </RuntimeCard>
  );
}

export { RuntimeWorkerTable };
export type { RuntimeWorkerTableProps };
