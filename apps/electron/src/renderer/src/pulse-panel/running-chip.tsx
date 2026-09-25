import { DurationTag, Spinner } from '@paiapp/ui';
import { agentElapsedMs } from '@/thread/panel-summary';
import { formatElapsed } from '@/thread/format-elapsed';
import type { SubagentModel } from '@/thread/thread-model';
import { copy } from '@/strings';

type RunningChipProps = {
  running: readonly SubagentModel[]
  now: number
  onOpen: () => void
};

/** 运行态浮动胶囊（面板收起时的运行状态载体）：当前动作一行 + 计时；无运行中不渲染。 */
function RunningChip({ running, now, onOpen }: RunningChipProps) {
  const first = running[0];
  if (first === undefined) return null;
  const taskText = first.task.length > 0 ? first.task : first.name;
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={copy.pulse.running.aria(running.length)}
      title={taskText}
      className="pointer-events-auto flex h-7 max-w-[280px] cursor-pointer items-center gap-1.5 rounded-full border border-border bg-popover px-2.5 text-muted-foreground shadow-lg shadow-black/5 outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <Spinner className="size-3 shrink-0 text-dot-active" />
      <span className="min-w-0 truncate text-[11px] leading-none">{taskText}</span>
      {running.length > 1 && <span className="shrink-0 font-mono text-[10px] leading-none tabular-nums">{copy.pulse.running.more(running.length - 1)}</span>}
      <DurationTag>{formatElapsed(agentElapsedMs(first, now))}</DurationTag>
    </button>
  );
}

export { RunningChip };
export type { RunningChipProps };
