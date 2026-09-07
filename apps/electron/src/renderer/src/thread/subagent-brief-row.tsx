import { Bot } from 'lucide-react';

import { copy } from '@/strings';
import { agentActivity, streamStatusLabelKey } from './agent-activity';
import { latestActiveAgent } from './active-subagent';
import type { SubagentModel } from './thread-model';

type SubagentBriefRowProps = {
  agents: readonly SubagentModel[]
  now: number
}

/** 对话流内的活动子代理简略行：名称 + 实时状态词（Thinking / Working）。 */
function SubagentBriefRow({ agents, now }: SubagentBriefRowProps) {
  const agent = latestActiveAgent(agents);
  if (agent === null) return null;
  const labelKey = streamStatusLabelKey(agentActivity(agent, now));
  if (labelKey === null) return null;
  const label = labelKey === 'thinking' ? copy.flow.statusThinking : copy.flow.statusWorking;

  return (
    <div className="pt-[14px]">
      <div className="flex items-center gap-[9px]">
        <Bot className="size-[14px] shrink-0 text-muted-foreground" strokeWidth={1.75} />
        <span className="truncate text-[12.5px] leading-[20px] text-foreground/90">{agent.name}</span>
      </div>
      <p className="pt-[10px] text-[12.5px] leading-[20px] text-muted-foreground">{label}</p>
    </div>
  );
}

export { SubagentBriefRow };
