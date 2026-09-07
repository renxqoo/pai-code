import { DiffBlock } from './diff-block';
import { SubagentsBlock } from './subagents-block';
import { TextBlock } from './text-block';
import { ThinkingBlock } from './thinking-block';
import { ToolsBlock } from './tools-block';
import type { TurnBlock } from './thread-model';

type TurnBlockViewProps = {
  block: TurnBlock
  now: number
  open: boolean
  onToggle: () => void
  onOpenAgents: () => void
  onOpenDiff: () => void
}

/** 轮次内容块分发：正文与过程块共用一套开合语义，形态各自独立。 */
function TurnBlockView({ block, now, open, onToggle, onOpenAgents, onOpenDiff }: TurnBlockViewProps) {
  if (block.kind === 'text') {
    return <TextBlock id={block.id} text={block.text} />;
  }
  if (block.kind === 'thinking') {
    return <ThinkingBlock id={block.id} text={block.text} open={open} onToggle={onToggle} />;
  }
  if (block.kind === 'tools') {
    return <ToolsBlock calls={block.calls} open={open} onToggle={onToggle} />;
  }
  if (block.kind === 'subagents') {
    return <SubagentsBlock agents={block.agents} now={now} open={open} onToggle={onToggle} onOpenAgents={onOpenAgents} />;
  }
  return <DiffBlock diff={block.diff} open={open} onToggle={onToggle} onOpenDiff={onOpenDiff} />;
}

export { TurnBlockView };
