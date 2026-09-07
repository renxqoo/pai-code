import { Bot, FileDiff, Plus } from 'lucide-react';

import { cn } from '@/lib/utils';

type ThreadTabsProps = {
  diffLabel: string
  diffHint: string
  agentsLabel: string
  addLabel: string
  /** 高亮语义：当前会话存在子代理活动（与面板开合无关） */
  agentsActive: boolean
  diffExpanded: boolean
  agentsExpanded: boolean
  onDiff: () => void
  onAgents: () => void
  onAdd: () => void
}

const tabBaseClassName =
  'flex h-[26px] cursor-pointer items-center gap-[6px] rounded-full px-[9px] text-[12px] leading-none outline-none select-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 aria-expanded:bg-muted aria-expanded:text-foreground'

/** 顶部跨栏标签行：Diff / Agents（各切换同一右侧面板槽位）/ +。 */
function ThreadTabs({
  diffLabel,
  diffHint,
  agentsLabel,
  addLabel,
  agentsActive,
  diffExpanded,
  agentsExpanded,
  onDiff,
  onAgents,
  onAdd,
}: ThreadTabsProps) {
  return (
    <div className="flex shrink-0 items-center gap-[3px]">
      <button
        type="button"
        onClick={onDiff}
        aria-label={diffHint}
        title={diffHint}
        aria-expanded={diffExpanded}
        className={cn(tabBaseClassName, 'text-muted-foreground hover:bg-accent hover:text-foreground')}
      >
        <FileDiff className="size-3" strokeWidth={1.75} />
        <span className="whitespace-nowrap">{diffLabel}</span>
      </button>
      <button
        type="button"
        onClick={onAgents}
        aria-expanded={agentsExpanded}
        className={cn(
          tabBaseClassName,
          agentsActive && !agentsExpanded ? 'bg-muted text-foreground' : 'text-muted-foreground hover:bg-accent hover:text-foreground',
        )}
      >
        <Bot className="size-3" strokeWidth={1.75} />
        <span className="whitespace-nowrap">{agentsLabel}</span>
      </button>
      <button
        type="button"
        onClick={onAdd}
        aria-label={addLabel}
        title={addLabel}
        className="flex size-[26px] shrink-0 cursor-pointer items-center justify-center rounded-full text-muted-foreground outline-none select-none transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <Plus className="size-[13px]" strokeWidth={1.75} />
      </button>
    </div>
  );
}

export { ThreadTabs };
