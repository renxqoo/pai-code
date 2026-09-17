import * as React from 'react';

import { CaretToggle, DurationTag, MetaLine, StatusDot, TypePill } from '@paiapp/ui';

import { copy } from '@/strings';
import { agentActivity } from '@/thread/agent-activity';
import { agentElapsedMs } from '@/thread/panel-summary';
import { formatElapsed } from '@/thread/format-elapsed';
import { SteerInput } from './steer-input';
import { formatTokenCount } from '@/thread/format-count-unit';
import { subagentStatusLabel } from '@/thread/subagent-status';
import type { SubagentModel } from '@/thread/thread-model';

import { AgentToolRow } from './agent-tool-row';

type AgentListItemProps = {
  agent: SubagentModel
  now: number
  /** 运行中子代理的行内 steer 输入（H1；不传则不显示；agentId 未知时同样不显示）。 */
  onSteer?: (agentId: string, message: string) => void
}

type DetailLine =
  | { kind: 'summary'; text: string }
  | { kind: 'tool'; toolName: string }
  | { kind: 'status'; label: string }
  | { kind: 'ask'; toolName: string; summary: string }
  | { kind: 'none' };

/**
 * 第二行的内容推导：权限等待最优先（时间敏感）；
 * 进行中显「▸ 当前工具」，无工具在跑显状态词（工作中/空闲）；
 * 归档后显报告摘要，无摘要时退回任务描述/最后工具名。
 */
function detailLine(agent: SubagentModel, now: number): DetailLine {
  if (agent.pendingAsk !== null) return { kind: 'ask', toolName: agent.pendingAsk.toolName, summary: agent.pendingAsk.summary };
  if (agent.status === 'on-disk') {
    if (agent.summary.length > 0) return { kind: 'summary', text: agent.summary };
    if (agent.task.length > 0) return { kind: 'summary', text: agent.task };
    const lastTool = agent.tools[agent.tools.length - 1];
    if (lastTool !== undefined) return { kind: 'tool', toolName: lastTool.name };
    return { kind: 'none' };
  }
  const activity = agentActivity(agent, now);
  if (activity.kind === 'tool') return { kind: 'tool', toolName: activity.toolName };
  return { kind: 'status', label: subagentStatusLabel(agent.status) };
}

/** 面板列表项：状态点 + 名称 + 类型胶囊 + 耗时 + 活动行 + 元信息行，可展开工具明细。 */
function AgentListItem({ agent, now, onSteer }: AgentListItemProps) {
  const [open, setOpen] = React.useState(false);
  const toggle = () => setOpen((current) => !current);
  const detail = detailLine(agent, now);
  const duration = agentElapsedMs(agent, now);
  const metaItems = [
    agent.model,
    agent.effort,
    copy.flow.metaTokens(formatTokenCount(agent.tokens)),
    copy.flow.metaTools(agent.toolCount),
  ].filter((item): item is string => item !== null);
  const steerable = agent.status === 'busy' && agent.agentId.length > 0;

  return (
    <div className="py-[8px]">
      <div className="flex h-[20px] items-center gap-[9px]">
        <StatusDot tone={agent.status === 'busy' ? 'active' : agent.status === 'idle' ? 'idle' : 'done'} />
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          className="min-w-0 shrink cursor-pointer truncate text-left text-[12.5px] leading-none font-medium text-foreground outline-none select-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {agent.name}
        </button>
        <TypePill label={agent.agentType} />
        <DurationTag className="ml-auto">{formatElapsed(duration)}</DurationTag>
      </div>
      {detail.kind !== 'none' ? (
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          className="mt-[6px] flex h-[16px] w-full cursor-pointer items-center rounded-md text-left outline-none select-none hover:bg-accent/50 focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <span className="flex min-w-0 items-center gap-[5px] pl-[16px] pr-[4px]">
            {detail.kind === 'tool' ? (
              <>
                <CaretToggle open={open} />
                <span className="truncate font-mono text-[11px] leading-none text-muted-foreground">
                  {detail.toolName}
                </span>
              </>
            ) : detail.kind === 'status' ? (
              <span className="text-[11.5px] leading-none text-muted-foreground">{detail.label}</span>
            ) : detail.kind === 'ask' ? (
              <span className="truncate text-[11.5px] leading-none text-foreground/85">
                {copy.flow.subagentAskPending(detail.toolName)}
              </span>
            ) : (
              <span className="truncate text-[11.5px] leading-[16px] text-foreground/85">{detail.text}</span>
            )}
          </span>
        </button>
      ) : null}
      {open ? (
        <div className="mt-[4px] flex flex-col gap-[2px] pb-[2px] pl-[16px]">
          {agent.tools.map((call) => (
            <AgentToolRow key={call.id} call={call} />
          ))}
        </div>
      ) : null}
      <div className="mt-[6px] pl-[16px]">
        <MetaLine items={metaItems} />
      </div>
      {onSteer !== undefined && steerable ? <SteerInput onSubmit={(message) => onSteer(agent.agentId, message)} /> : null}
    </div>
  );
}

export { AgentListItem };
