import type { AgentView } from '@paiapp/contracts';

import { copy } from '@/strings';

type AgentsSectionProps = {
  agents: readonly AgentView[]
  onRefresh: () => void
}

/** Agents 分区：agent 定义卡列表（名称 + 来源胶囊 + 描述 + model/tools meta），支持手动刷新。 */
function AgentsSection({ agents, onRefresh }: AgentsSectionProps) {
  return (
    <section>
      <div className="flex items-center justify-between pb-[10px]">
        <p className="pb-[10px] text-[11px] font-medium uppercase tracking-[0.06em] text-muted-foreground">{copy.settings.agentsTitle}</p>
        <button type="button" onClick={onRefresh} className="text-[11.5px] text-muted-foreground hover:text-foreground">
          {copy.settings.refresh}
        </button>
      </div>
      {agents.length === 0 ? <p className="pb-[10px] text-[12.5px] text-muted-foreground">{copy.settings.agentsEmpty}</p> : null}
      {agents.map((agent) => {
        const metaParts: string[] = [];
        if (agent.model !== null) metaParts.push(agent.model);
        if (agent.tools !== null) metaParts.push(copy.settings.agentsTools(agent.tools.length));
        return (
          <div
            key={agent.name}
            className="mb-[8px] flex flex-col gap-[4px] rounded-[10px] border border-border px-[12px] py-[10px]"
          >
            <div className="flex items-center justify-between gap-[10px]">
              <span className="min-w-0 truncate text-[12.5px] font-medium text-foreground">{agent.name}</span>
              <span
                className={
                  agent.source === 'project'
                    ? 'shrink-0 rounded-full border border-foreground/60 px-[7px] py-[1px] font-mono text-[10px] leading-[15px] text-foreground'
                    : 'shrink-0 rounded-full border border-border px-[7px] py-[1px] font-mono text-[10px] leading-[15px] text-muted-foreground'
                }
              >
                {agent.source === 'project' ? copy.settings.agentsProjectBadge : copy.settings.agentsUserBadge}
              </span>
            </div>
            {agent.description.length > 0 ? (
              <p className="text-[11.5px] leading-[16px] text-muted-foreground">{agent.description}</p>
            ) : null}
            {metaParts.length > 0 ? <p className="text-[11px] text-muted-foreground/80">{metaParts.join(' · ')}</p> : null}
          </div>
        );
      })}
    </section>
  );
}

export { AgentsSection };
