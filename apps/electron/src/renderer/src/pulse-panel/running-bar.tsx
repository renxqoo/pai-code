import { DurationTag, Spinner, TypePill } from '@paiapp/ui';
import { agentElapsedMs } from '@/thread/panel-summary';
import { formatElapsed } from '@/thread/format-elapsed';
import type { SubagentModel } from '@/thread/thread-model';
import { copy } from '@/strings';

type RunningBarProps = {
  running: readonly SubagentModel[]
  now: number
  onOpen: () => void
};

/** 面板底部运行条：有运行中子代理时固定展示当前动作 + 计时（多运行中 +N）；无运行中不渲染。 */
function RunningBar({ running, now, onOpen }: RunningBarProps) {
  const first = running[0];
  if (first === undefined) return null;
  const taskText = first.task.length > 0 ? first.task : first.name;
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={copy.pulse.running.aria(running.length)}
      className="flex w-full cursor-pointer items-center gap-2 px-3.5 py-2 text-left outline-none hover:bg-accent/50 focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <Spinner className="size-3.5 shrink-0 text-dot-active" />
      <span className="min-w-0 flex-1 truncate text-[11px] leading-none text-muted-foreground" title={taskText}>
        {taskText}
      </span>
      {running.length > 1 && <TypePill label={copy.pulse.running.more(running.length - 1)} />}
      <DurationTag>{formatElapsed(agentElapsedMs(first, now))}</DurationTag>
    </button>
  );
}

export { RunningBar };
export type { RunningBarProps };
