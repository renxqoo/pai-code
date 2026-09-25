import { DurationTag, Spinner, StatusDot } from '@paiapp/ui';
import { agentElapsedMs } from '@/thread/panel-summary';
import { formatElapsed } from '@/thread/format-elapsed';
import { subagentStatusLabel } from '@/thread/subagent-status';
import type { SubagentModel } from '@/thread/thread-model';
import { copy } from '@/strings';

type AgentRowProps = {
  agent: SubagentModel
  /** 计时基准（运行中实时累加；已终态冻结在 endedAt） */
  now: number
  onSelect: () => void
};

/** 子代理行（速览面板智能体区）：状态指示 + 名称 + 任务摘要 + 耗时；点击打开 Agents 面板。 */
function AgentRow({ agent, now, onSelect }: AgentRowProps) {
  const running = agent.status === 'running';
  const taskText = agent.task.length > 0 ? agent.task : agent.summary;
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        aria-label={copy.pulse.agents.rowAria(agent.name)}
        title={subagentStatusLabel(agent.status)}
        className="flex w-full cursor-pointer items-center gap-2 rounded-lg px-1.5 py-1 text-left outline-none select-none hover:bg-accent/50 focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        {running ? <Spinner className="size-3.5 shrink-0 text-dot-active" /> : <StatusDot tone={agent.status === 'stopped' ? 'done' : 'idle'} />}
        <span className="shrink-0 text-[12px] font-medium text-foreground">{agent.name}</span>
        <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground" title={taskText}>
          {taskText}
        </span>
        <DurationTag>{formatElapsed(agentElapsedMs(agent, now))}</DurationTag>
      </button>
    </li>
  );
}

export { AgentRow };
export type { AgentRowProps };
