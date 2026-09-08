import { DiffBlock } from './diff-block';
import { SubagentsBlock } from './subagents-block';
import { TextBlock } from './text-block';
import type { StandaloneTurnBlock } from './process-runs';

import { copy } from '@/strings';

type TurnBlockViewProps = {
  block: StandaloneTurnBlock
  onOpenAgents: () => void
  onOpenDiff: () => void
}

/**
 * 独立块的展示分发：思考/工具块渲染期已聚合成过程组，不经过这里；
 * 只处理正文、子代理条、diff 卡与轮次异常提示。
 */
function TurnBlockView({ block, onOpenAgents, onOpenDiff }: TurnBlockViewProps) {
  if (block.kind === 'text') {
    return <TextBlock id={block.id} text={block.text} />;
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
