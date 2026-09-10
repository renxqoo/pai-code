import * as React from 'react';
import { copy } from '@/strings';
import { formatClockTime } from './format-clock-time';
import { formatElapsed } from './format-elapsed';
import { processRuns } from './process-runs';
import { turnElapsedMs, isTurnRunning, visibleTurnBlocks } from './turn-state';
import { turnTextContent } from './turn-text';
import { ProcessGroup } from './process-group';
import { TurnBlockView } from './turn-block-view';
import { TurnStatusLine } from './turn-status-line';
import { TurnTimestampRow } from './turn-timestamp-row';
import { useTurnCollapse } from './use-turn-collapse';
import type { TurnModel } from './thread-model';

type TurnGroupProps = {
  turn: TurnModel
  now: number
  onOpenDiff: () => void
}

/**
 * 单个轮次：状态行（走表/冻结，过程整体开合的唯一开关）+ 渲染段 + 结束时刻时间戳行。
 * 过程（思考/工具/diff/中间文本）作为整体展开或收起；收起时只留最后一条文本输出。
 * 展开时相邻思考/工具聚合为带竖轨的过程组，正文/diff 等独立呈现。
 * section 带 data-turn-id：锚点带（TurnAnchorRail）按它定位并跳转滚入视口。
 */
function TurnGroup({ turn, now, onOpenDiff }: TurnGroupProps) {
  const collapse = useTurnCollapse(turn);
  const elapsed = turnElapsedMs(turn, now);
  const label =
    turn.status === 'stopped'
      ? copy.flow.turnStoppedSummary(formatElapsed(elapsed))
      : `${turn.status === 'running' ? copy.flow.workingFor : copy.flow.workedFor} ${formatElapsed(elapsed)}`;
  const endedAt = turn.status === 'running' ? null : turn.endedAt;
  const runs = processRuns(visibleTurnBlocks(turn.blocks, collapse.turnOpen));

  return (
    <section data-turn-id={turn.id} className="scroll-mt-[24px]">
      <TurnStatusLine
        label={label}
        expandable={endedAt !== null}
        open={collapse.turnOpen}
        onToggle={collapse.toggleTurn}
      />
      <div className="flex flex-col gap-[14px] pt-[12px]">
        {runs.map((run) =>
          run.kind === 'process' ? (
            <ProcessGroup
              key={`process-${run.blocks[0]?.id ?? ''}`}
              blocks={run.blocks}
              running={isTurnRunning(turn)}
            />
          ) : (
            <TurnBlockView key={run.block.id} block={run.block} onOpenDiff={onOpenDiff} />
          ),
        )}
      </div>
      {endedAt !== null ? (
        <div className="pt-[20px]">
          <TurnTimestampRow time={formatClockTime(endedAt)} value={turnTextContent(turn)} />
        </div>
      ) : null}
    </section>
  );
}

// 比较器只看数据身份与时刻：回调/开面板函数引用不稳（内联箭头）不触发重渲，
// 流式期间仅当前轮次（turn 引用变化）真正重渲；已结束轮 elapsed 冻结，tick 不再触发重渲
const TurnGroupMemo = React.memo(
  TurnGroup,
  (prev, next) => prev.turn === next.turn && (!isTurnRunning(prev.turn) || prev.now === next.now),
);
export { TurnGroupMemo as TurnGroup };
