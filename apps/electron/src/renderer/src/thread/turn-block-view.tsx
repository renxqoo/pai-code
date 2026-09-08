import { DiffBlock } from './diff-block';
import { SubagentsBlock } from './subagents-block';
import { TextBlock } from './text-block';
import { ThinkingBlock } from './thinking-block';
import { ToolsBlock } from './tools-block';
import type { TurnBlock } from './thread-model';

import { copy } from '@/strings';

type TurnBlockViewProps = {
  block: TurnBlock
  onOpenAgents: () => void
  onOpenDiff: () => void
}

/** 轮次内容块分发：过程开合由轮级开关整体控制，块自身不再携带二级开关。 */
function TurnBlockView({ block, onOpenAgents, onOpenDiff }: TurnBlockViewProps) {
  if (block.kind === 'text') {
    return <TextBlock id={block.id} text={block.text} />;
  }
  if (block.kind === 'thinking') {
    return <ThinkingBlock id={block.id} text={block.text} />;
  }
  if (block.kind === 'tools') {
    return <ToolsBlock calls={block.calls} />;
  }
  if (block.kind === 'subagents') {
    return <SubagentsBlock agents={block.agents} onOpenAgents={onOpenAgents} />;
  }
  if (block.kind === 'turnFailure') {
    const label = block.stopReason === 'error' ? copy.thread.turnFailedLabel : copy.thread.turnAbortedLabel;
    return (
      <p
        title={block.message ?? label}
        className={`text-[11.5px] leading-[16px] break-all ${block.stopReason === 'error' ? 'text-red-600' : 'text-muted-foreground'}`}
      >
        {block.message !== null && block.message.length > 0 ? `${label} · ${block.message}` : label}
      </p>
    );
  }
  return <DiffBlock diff={block.diff} onOpenDiff={onOpenDiff} />;
}

export { TurnBlockView };
