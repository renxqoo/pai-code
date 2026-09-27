import { changedFileCount as changedFileCountOfCalls } from '@paiapp/ui-thread';
import type { TurnBlock, TurnModel } from './thread-model';

/** 轮次是否仍在走表（细节实时展开、状态行实时计时）。 */
export function isTurnRunning(turn: Pick<TurnModel, 'status'>): boolean {
  return turn.status === 'running';
}

/**
 * 轮级变更摘要：成功改动的文件数（编辑类调用，去重文件路径）。
 * 轮收起时挂在状态行旁（`TurnGroup`），**不进块列表**——收起 = 「这个过程
 * 我不看」，列表里就不该有可点的东西（diff 行是展开控件）。
 * 无成功编辑返回 null（无变更可报）。计数语义在共享包（只收成功调用、按路径去重）。
 */
export function changedFileCount(blocks: readonly TurnBlock[]): number | null {
  return changedFileCountOfCalls(blocks.flatMap((block) => (block.kind === 'tools' ? block.calls : [])));
}

/**
 * 过程整体收起时的可见块：只保留最终结果文本——最后一个 tools 块之后的最后一条
 * text（轮以工具收尾且无后续 text 时不取工具前旁白）；无 tools 时取最后一条 text。
 * 异常终态提示（报错/中止）无论开合都保持可见。展开时全部块按原顺序可见。
 */
export function visibleTurnBlocks(blocks: readonly TurnBlock[], processOpen: boolean): readonly TurnBlock[] {
  if (processOpen) return blocks;
  const failure = blocks.find((block) => block.kind === 'turnFailure');
  const result = resultTextBlock(blocks);
  const visible: TurnBlock[] = result !== null ? [result] : [];
  if (failure !== undefined) visible.push(failure);
  return visible;
}

/** 结果文本：最后一个 tools 块之后的最后一条非空 text；无 tools 时取最后一条非空
 * text（整块空白的文本跳过回退）。轮以工具收尾且无后续非空 text 时返回 null，
 * 不回退到工具前旁白。 */
export function resultTextBlock(blocks: readonly TurnBlock[]): TurnBlock | null {
  let lastTools = -1;
  for (let index = 0; index < blocks.length; index += 1) {
    if (blocks[index]?.kind === 'tools') lastTools = index;
  }
  for (let index = blocks.length - 1; index > lastTools; index -= 1) {
    const block = blocks[index];
    if (block?.kind === 'text' && block.text.trim().length > 0) return block;
  }
  return null;
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
