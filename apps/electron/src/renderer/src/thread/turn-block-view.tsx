import { DiffBlock } from './diff-block';
import { TextBlock } from './text-block';
import type { StandaloneTurnBlock } from './process-runs';

import { copy } from '@/strings';

type TurnBlockViewProps = {
  block: StandaloneTurnBlock
  onOpenDiff: () => void
}

/**
 * 独立块的展示分发：思考/工具块渲染期已聚合成过程组，不经过这里；
 * 只处理正文、diff 卡与轮次异常提示。
 */
function TurnBlockView({ block, onOpenDiff }: TurnBlockViewProps) {
  if (block.kind === 'text') {
    return <TextBlock text={block.text} />;
  }
  if (block.kind === 'turnFailure') {
    const label = block.stopReason === 'error' ? copy.thread.turnFailedLabel : copy.thread.turnAbortedLabel;
    return (
      <p
        title={block.message ?? label}
        className={`text-[11px] leading-[16px] break-all ${block.stopReason === 'error' ? 'text-red-600' : 'text-muted-foreground'}`}
      >
        {block.message !== null && block.message.length > 0 ? `${label} · ${block.message}` : label}
      </p>
    );
  }
  return <DiffBlock diff={block.diff} onOpenDiff={onOpenDiff} />;
}

export { TurnBlockView };
