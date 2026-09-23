import type { TurnBlock, TurnModel } from './thread-model';

/** 轮次是否仍在走表（细节实时展开、状态行实时计时）。 */
export function isTurnRunning(turn: Pick<TurnModel, 'status'>): boolean {
  return turn.status === 'running';
}

/**
 * 过程整体收起时的可见块：只保留最后一条文本输出（中间文本属于过程）；
 * 异常终态提示（报错/中止）无论开合都保持可见。
 * 展开时全部块按原顺序可见。
 */
export function visibleTurnBlocks(blocks: readonly TurnBlock[], processOpen: boolean): readonly TurnBlock[] {
  if (processOpen) return blocks;
  const texts = blocks.filter((block) => block.kind === 'text');
  const failure = blocks.find((block) => block.kind === 'turnFailure');
  const visible: TurnBlock[] = texts.length > 0 ? [texts[texts.length - 1] as TurnBlock] : [];
  if (failure !== undefined) visible.push(failure);
  return visible;
}

/**
 * 轮次是否异常结束（非自然完成）：用户停止/回收打断（status stopped）或轮末异常提示块
 * （上游报错/中止——与转写重建 failureOf 同一展示面）。运行中的轮尚未结束不在此列；
 * 正常完成（completed 且无失败块）不算异常。
 */
export function turnEndedAbnormally(turn: Pick<TurnModel, 'status' | 'blocks'>): boolean {
  if (turn.status === 'running') return false;
  return turn.status === 'stopped' || turn.blocks.some((block) => block.kind === 'turnFailure');
}

/**
 * 计时基准：运行中取观察时刻，结束/停止冻结在 endedAt。
 * 非有限时间与倒挂区间（endedAt < startedAt、时钟回拨）一律降级为 0。
 */
export function turnElapsedMs(
  turn: Pick<TurnModel, 'status' | 'startedAt' | 'endedAt'>,
  now: number,
): number {
  const endAt = turn.status === 'running' ? now : turn.endedAt;
  if (endAt === null || !Number.isFinite(endAt) || !Number.isFinite(turn.startedAt)) return 0;
  return Math.max(0, endAt - turn.startedAt);
}
