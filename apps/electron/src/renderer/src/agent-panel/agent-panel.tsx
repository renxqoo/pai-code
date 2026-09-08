import * as React from 'react';
import { X } from 'lucide-react';

import { IconButton } from '@paiapp/ui';

import { WINDOWS_CAPTION_WIDTH } from '@/lib/platform';
import { copy } from '@/strings';
import { summarizeAgents } from '@/thread/panel-summary';
import type { SubagentModel } from '@/thread/thread-model';

import { AgentListItem } from './agent-list-item';
import { PanelSummaryBar } from './panel-summary-bar';

type AgentPanelProps = {
  agents: readonly SubagentModel[]
  now: number
  onClose: () => void
  /** 向运行中子代理注入 steer（H1；不传则行内输入不显示）。 */
  onSteer?: (subagentId: string, message: string) => void
}

/** Agent 侧边栏：DIRECT SPAWNS 列表 + 底部汇总，Esc / 关闭入口 / 顶部标签均可收起。 */
function AgentPanel({ agents, now, onClose, onSteer }: AgentPanelProps) {
  const summary = summarizeAgents(agents);

  return (
    <aside className="flex h-full w-[360px] shrink-0 flex-col border-l border-border bg-background">
      <div
        className="flex h-[46px] shrink-0 items-center justify-between pl-[14px]"
        style={{ paddingRight: WINDOWS_CAPTION_WIDTH + 14 }}
      >
        <h2 className="text-[10.5px] leading-none font-medium tracking-[0.08em] text-muted-foreground uppercase">
          {copy.flow.panelTitle}
        </h2>
        <IconButton label={copy.flow.closeAgents} size="sm" onClick={onClose} className="-mr-1">
          <X strokeWidth={1.75} />
        </IconButton>
      </div>
      {agents.length === 0 ? (
        <div className="flex flex-1 items-center justify-center px-[14px] pb-[10px]">
          <p className="text-[12px] leading-[19px] text-muted-foreground/80">{copy.flow.agentsPanelEmpty}</p>
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto px-[14px] pt-[2px] pb-[10px]">
          {agents.map((agent) => (
            <AgentListItem key={agent.id} agent={agent} now={now} onSteer={onSteer} />
          ))}
        </div>
      )}
      <PanelSummaryBar summary={summary} />
    </aside>
  );
}

const AgentPanelMemo = React.memo(AgentPanel);
export { AgentPanelMemo as AgentPanel };
