import * as React from 'react';
import { Bot } from 'lucide-react';

import { CaretToggle, StatusDot } from '@paiapp/ui';

import { copy } from '@/strings';
import { summarizeAgents } from './panel-summary';
import type { SubagentModel } from './thread-model';

type SubagentsBlockProps = {
  agents: readonly SubagentModel[]
  onOpenAgents: () => void
}

/**
 * 子代理通知条：蓝点 + "Kicked off N subagents" + 右侧进行中/token 概要与面板入口。
 * 条本身不再折叠；子代理明细（名称/状态/工具）只在 Agents 面板展示。
 */
function SubagentsBlock({ agents, onOpenAgents }: SubagentsBlockProps) {
  const summary = summarizeAgents(agents);
  const dotTone = summary.workingCount > 0 ? 'active' : 'done';
  const tokens = agents.reduce((total, agent) => total + (agent.tokens ?? 0), 0);

  return (
    <div className="flex h-[26px] items-center gap-[8px] rounded-[9px] border border-border px-[10px]">
      <StatusDot tone={dotTone} />
      <Bot className="size-[14px] shrink-0 text-muted-foreground" strokeWidth={1.75} />
      <span className="truncate text-[12.5px] leading-none font-medium text-foreground">
        {copy.flow.subagentsSummary(agents.length)}
      </span>
      <div className="ml-auto flex shrink-0 items-center gap-[9px]">
        <span className="font-mono text-[11px] leading-none text-muted-foreground">
          {copy.flow.notifySummary(summary.workingCount, tokens)}
        </span>
        <button
          type="button"
          onClick={onOpenAgents}
          className="flex cursor-pointer items-center gap-[5px] rounded-md py-[2px] text-[12px] leading-none font-medium text-link outline-none select-none hover:opacity-85 focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {copy.flow.openAgents}
          <CaretToggle open={false} className="text-link" />
        </button>
      </div>
    </div>
  );
}

const SubagentsBlockMemo = React.memo(SubagentsBlock);
export { SubagentsBlockMemo as SubagentsBlock };
