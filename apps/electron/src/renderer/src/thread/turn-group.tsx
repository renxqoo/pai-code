import * as React from 'react';
import { copy } from '@/strings';
import { formatClockTime } from './format-clock-time';
import { formatElapsed } from './format-elapsed';
import { processRuns } from './process-runs';
import { turnAnchorSummary } from './turn-anchor-data';
import { turnElapsedMs, isTurnRunning, visibleTurnBlocks } from './turn-state';
import { turnTextContent } from './turn-text';
import { ProcessGroup } from './process-group';
import { TurnAnchor } from './turn-anchor';
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
 * 单个轮次：状态行（走表/冻结，过程整体开合的唯一开关）+ 渲染段 + 结束时刻时间戳行。
 * 过程（思考/工具/子代理/diff/中间文本）作为整体展开或收起；收起时只留最后一条文本输出。
 * 展开时相邻思考/工具聚合为带竖轨的过程组，正文/diff 等独立呈现。
 * 已结束的轮次在左缘栏沟挂锚点（时刻 + 摘要 tooltip），点击把该轮滚入消息流视口。
 */
function TurnGroup({ turn, now, onOpenAgents, onOpenDiff }: TurnGroupProps) {
  const sectionRef = React.useRef<HTMLElement | null>(null);
  const collapse = useTurnCollapse(turn);
  const elapsed = turnElapsedMs(turn, now);
  const label =
    turn.status === 'stopped'
      ? copy.flow.turnStoppedSummary(formatElapsed(elapsed))
      : `${turn.status === 'running' ? copy.flow.workingFor : copy.flow.workedFor} ${formatElapsed(elapsed)}`;
  const endedAt = turn.status === 'running' ? null : turn.endedAt;
  const runs = processRuns(visibleTurnBlocks(turn.blocks, collapse.turnOpen));
  const jumpToTurn = React.useCallback(() => {
    const section = sectionRef.current;
    if (section === null) return;
    // 尊重系统减弱动态偏好：平滑滚动降级为直接定位
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    section.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start', inline: 'nearest' });
  }, []);

  return (
    <section ref={sectionRef} className="relative scroll-mt-[24px]">
      {endedAt !== null ? (
        <TurnAnchor time={formatClockTime(endedAt)} summary={turnAnchorSummary(turn)} onJump={jumpToTurn} />
      ) : null}
      <TurnStatusLine
        label={label}
        expandable={endedAt !== null}
        open={collapse.turnOpen}
        onToggle={collapse.toggleTurn}
      />
      <div className="flex flex-col gap-[18px] pt-[36px]">
        {runs.map((run) =>
          run.kind === 'process' ? (
            <ProcessGroup
              key={`process-${run.blocks[0]?.id ?? ''}`}
              blocks={run.blocks}
              running={isTurnRunning(turn)}
            />
          ) : (
            <TurnBlockView key={run.block.id} block={run.block} onOpenAgents={onOpenAgents} onOpenDiff={onOpenDiff} />
          ),
        )}
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
// 流式期间仅当前轮次（turn 引用变化）真正重渲；已结束轮 elapsed 冻结，tick 不再触发重渲
const TurnGroupMemo = React.memo(
  TurnGroup,
  (prev, next) => prev.turn === next.turn && (!isTurnRunning(prev.turn) || prev.now === next.now),
);
export { TurnGroupMemo as TurnGroup };
