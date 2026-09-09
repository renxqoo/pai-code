import { Bot, RefreshCw } from 'lucide-react';

import type { AgentView } from '@paiapp/contracts';
import { IconButton } from '@paiapp/ui';

import { copy } from '@/strings';

import { SettingsCard } from './settings-card';
import { SettingsPageHeader } from './settings-page-header';

type AgentsSectionProps = {
  list: readonly AgentView[]
  onRefresh: () => void
}

/** Agents 分区：agent 定义卡列表（图标容器 + 名称 + 来源徽章 + 描述 + model/tools meta）+ 手动刷新。 */
function AgentsSection({ list, onRefresh }: AgentsSectionProps) {
  return (
    <section>
      <SettingsPageHeader title={copy.settings.agentsTitle} description={copy.settings.agentsDesc} />
      <div className="flex flex-col gap-[16px]">
        <div className="flex justify-end">
          <IconButton label={copy.settings.refresh} onClick={onRefresh}>
            <RefreshCw strokeWidth={1.75} />
          </IconButton>
        </div>
        {list.length === 0 ? (
          <p className="text-[12.5px] leading-[18px] text-muted-foreground">{copy.settings.agentsEmpty}</p>
        ) : (
          <div className="flex flex-col gap-[12px]">
            {list.map((agent) => {
              const metaParts: string[] = [];
              if (agent.model !== null) metaParts.push(agent.model);
              if (agent.tools !== null) metaParts.push(copy.settings.agentsTools(agent.tools.length));
              return (
                <SettingsCard key={agent.name} className="flex items-start gap-[14px] px-[16px] py-[14px] transition-colors hover:bg-accent/30">
                  <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                    <Bot className="size-[18px]" strokeWidth={1.75} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-[8px]">
                      <p className="min-w-0 truncate text-[13px] leading-[18px] font-medium text-foreground">{agent.name}</p>
                      <span
                        className={
                          agent.source === 'project'
                            ? 'shrink-0 rounded-full border border-foreground/50 px-2 py-[1px] text-[11px] leading-[16px] text-foreground'
                            : 'shrink-0 rounded-full border border-border px-2 py-[1px] text-[11px] leading-[16px] text-muted-foreground'
                        }
                      >
                        {agent.source === 'project' ? copy.settings.agentsProjectBadge : copy.settings.agentsUserBadge}
                      </span>
                    </div>
                    {agent.description.length > 0 ? (
                      <p className="mt-[2px] line-clamp-2 text-[12px] leading-[17px] text-muted-foreground">{agent.description}</p>
                    ) : null}
                    {metaParts.length > 0 ? (
                      <p className="mt-[2px] text-[11.5px] leading-[16px] text-muted-foreground/80">{metaParts.join(' · ')}</p>
                    ) : null}
                  </div>
                </SettingsCard>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}

export { AgentsSection };
