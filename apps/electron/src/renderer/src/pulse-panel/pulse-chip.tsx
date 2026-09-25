import { DiffStat, formatDiffDelta } from '@paiapp/ui';
import { copy } from '@/strings';

import type { PulseChipSegments } from './pulse-assembly';

type PulseChipProps = {
  segments: PulseChipSegments
  onExpand: () => void
};

/**
 * 收起态胶囊（速览面板）：更改增删 / 进程 n/m / 运行中 k 三段聚合，
 * 缺数据的段不渲染（全空只留面板名）；点击展开面板。
 */
function PulseChip({ segments, onExpand }: PulseChipProps) {
  const parts: string[] = [];
  if (segments.changes !== null) {
    parts.push(
      `${copy.pulse.git.changes} ${formatDiffDelta('add', segments.changes.additions)} ${formatDiffDelta('del', segments.changes.deletions)}`,
    );
  }
  if (segments.progress !== null) {
    parts.push(copy.pulse.todo.progress(segments.progress.done, segments.progress.total));
  }
  if (segments.running > 0) {
    parts.push(copy.pulse.agents.working(segments.running));
  }
  const summary = parts.join(' · ');
  return (
    <button
      type="button"
      onClick={onExpand}
      aria-label={copy.pulse.chipAria(summary)}
      title={summary}
      className="pointer-events-auto flex h-8 cursor-pointer items-center gap-2 rounded-full border border-border bg-popover px-3 shadow-lg shadow-black/5 outline-none hover:bg-accent/50 focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <span className="text-[11px] leading-none font-medium text-foreground">{copy.pulse.title}</span>
      {segments.changes !== null && (
        <>
          <span aria-hidden="true" className="h-3 w-px bg-border" />
          <span className="flex items-center gap-1">
            <span className="text-[11px] leading-none text-muted-foreground">{copy.pulse.git.changes}</span>
            <DiffStat additions={segments.changes.additions} deletions={segments.changes.deletions} />
          </span>
        </>
      )}
      {segments.progress !== null && (
        <>
          <span aria-hidden="true" className="h-3 w-px bg-border" />
          <span className="font-mono text-[11px] leading-none tabular-nums text-muted-foreground">
            {copy.pulse.todo.progress(segments.progress.done, segments.progress.total)}
          </span>
        </>
      )}
      {segments.running > 0 && (
        <>
          <span aria-hidden="true" className="h-3 w-px bg-border" />
          <span className="font-mono text-[11px] leading-none tabular-nums text-dot-active">{copy.pulse.agents.working(segments.running)}</span>
        </>
      )}
    </button>
  );
}

export { PulseChip };
export type { PulseChipProps };
