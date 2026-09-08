import * as React from 'react';
import { Bot } from 'lucide-react';

import { CaretToggle, StatusDot } from '@paiapp/ui';

import { copy } from '@/strings';
import { summarizeAgents } from './panel-summary';
import { SubagentBriefRow } from './subagent-brief-row';
import type { SubagentModel } from './thread-model';

type SubagentsBlockProps = {
  agents: readonly SubagentModel[]
  now: number
  open: boolean
  onToggle: () => void
  onOpenAgents: () => void
}

/**
 * 子代理通知条：蓝点 + "Kicked off N subagents" + 右侧进行中/token 概要与面板入口。
 * 展开时在条下方展示最近一个仍在活动的子代理简略行；全部结束后并入摘要，不再单独占行。
 */
function SubagentsBlock({ agents, now, open, onToggle, onOpenAgents }: SubagentsBlockProps) {
  const summary = summarizeAgents(agents);
  const dotTone = summary.workingCount > 0 ? 'active' : 'done';
  const tokens = agents.reduce((total, agent) => total + (agent.tokens ?? 0), 0);

  return (
    <div>
      <div className="flex h-[26px] items-center gap-[8px] rounded-[9px] border border-border px-[10px]">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          className="flex min-w-0 cursor-pointer items-center gap-[8px] rounded-md py-[2px] pr-[6px] outline-none select-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <StatusDot tone={dotTone} />
          <Bot className="size-[14px] shrink-0 text-muted-foreground" strokeWidth={1.75} />
          <span className="truncate text-[12.5px] leading-none font-medium text-foreground">
            {copy.flow.subagentsSummary(agents.length)}
          </span>
        </button>
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
      {open ? <SubagentBriefRow agents={agents} now={now} /> : null}
    </div>
  );
}

const SubagentsBlockMemo = React.memo(SubagentsBlock);
export { SubagentsBlockMemo as SubagentsBlock };
