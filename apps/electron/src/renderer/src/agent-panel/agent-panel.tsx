import * as React from 'react';

import { copy } from '@/strings';
import { summarizeAgents } from '@/thread/panel-summary';
import type { SubagentModel } from '@/thread/thread-model';

import { AgentListItem } from './agent-list-item';
import { PanelSummaryBar } from './panel-summary-bar';

type AgentPanelProps = {
  agents: readonly SubagentModel[]
  now: number
  /** 向运行中子代理注入 steer（H1；不传则行内输入不显示）。 */
  onSteer?: (subagentId: string, message: string) => void
}

/** 子代理 pane（面板容器提供标签行与外框）：派生列表 + 底部汇总。 */
function AgentPanel({ agents, now, onSteer }: AgentPanelProps) {
  const summary = summarizeAgents(agents);

  return (
    <>
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
    </>
  );
}

const AgentPanelMemo = React.memo(AgentPanel);
export { AgentPanelMemo as AgentPanel };
