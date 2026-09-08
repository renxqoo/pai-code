import * as React from 'react';
import { copy } from '@/strings';
import { formatClockTime } from './format-clock-time';
import { formatElapsed } from './format-elapsed';
import { turnElapsedMs } from './turn-state';
import { turnTextContent } from './turn-text';
import { TurnBlockView } from './turn-block-view';
import { TurnStatusLine } from './turn-status-line';
import { TurnTimestampRow } from './turn-timestamp-row';
import { useTurnCollapse } from './use-turn-collapse';
import type { TurnModel } from './thread-model';

type TurnGroupProps = {
  turn: TurnModel
  now: number
  onOpenAgents: () => void
  onOpenDiff: () => void
}

/**
 * 单个轮次：状态行（走表/冻结）+ 内容块 + 结束时刻时间戳行。
 * 运行中细节实时展开，结束后的过程块自动折叠为摘要。
 */
function TurnGroup({ turn, now, onOpenAgents, onOpenDiff }: TurnGroupProps) {
  const collapse = useTurnCollapse(turn);
  const elapsed = turnElapsedMs(turn, now);
  const label =
    turn.status === 'stopped'
      ? copy.flow.turnStoppedSummary(formatElapsed(elapsed))
      : `${turn.status === 'running' ? copy.flow.workingFor : copy.flow.workedFor} ${formatElapsed(elapsed)}`;
  const endedAt = turn.status === 'running' ? null : turn.endedAt;

  return (
    <section>
      <TurnStatusLine
        label={label}
        expandable={endedAt !== null}
        open={collapse.turnOpen}
        onToggle={collapse.toggleTurn}
      />
      <div className="flex flex-col gap-[18px] pt-[22px]">
        {turn.blocks.map((block) => (
          <TurnBlockView
            key={block.id}
            block={block}
            now={now}
            open={collapse.blockOpen(block.id)}
            onToggle={() => collapse.toggleBlock(block.id)}
            onOpenAgents={onOpenAgents}
            onOpenDiff={onOpenDiff}
          />
        ))}
      </div>
      {endedAt !== null ? (
        <div className="pt-[24px]">
          <TurnTimestampRow time={formatClockTime(endedAt)} value={turnTextContent(turn)} />
        </div>
      ) : null}
    </section>
  );
}

// 比较器只看数据身份与时刻：回调/开面板函数引用不稳（内联箭头）不触发重渲，
// 流式期间仅当前轮次（turn 引用变化）真正重渲
const TurnGroupMemo = React.memo(
  TurnGroup,
  (prev, next) => prev.turn === next.turn && prev.now === next.now,
);
export { TurnGroupMemo as TurnGroup };
