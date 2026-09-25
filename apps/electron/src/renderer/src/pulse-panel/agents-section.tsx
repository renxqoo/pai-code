import { CollapsibleSection } from '@paiapp/ui';
import type { SubagentModel } from '@/thread/thread-model';
import { copy } from '@/strings';

import { AgentRow } from './agent-row';
import { runningAgentsOf } from './pulse-assembly';

type AgentsSectionProps = {
  agents: readonly SubagentModel[]
  now: number
  open: boolean
  onOpenChange: (open: boolean) => void
  onSelect: () => void
};

/** 智能体分区（速览面板）：工作中计数 meta + 子代理行清单；无子代理整区隐藏。 */
function AgentsSection({ agents, now, open, onOpenChange, onSelect }: AgentsSectionProps) {
  if (agents.length === 0) return null;
  const working = runningAgentsOf(agents).length;
  return (
    <CollapsibleSection
      open={open}
      onOpenChange={onOpenChange}
      title={copy.pulse.agents.section}
      meta={working > 0 ? copy.pulse.agents.working(working) : undefined}
    >
      <ul className="flex flex-col px-1.5 pb-2">
        {agents.map((agent) => (
          <AgentRow key={agent.id} agent={agent} now={now} onSelect={onSelect} />
        ))}
      </ul>
    </CollapsibleSection>
  );
}

export { AgentsSection };
export type { AgentsSectionProps };
