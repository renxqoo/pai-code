import type { TurnBlock } from './thread-model';

/**
 * 轮次块 → 渲染段：相邻的过程块（思考/工具）聚合成一段连续「过程组」，
 * 由共享的左侧竖轨呈现执行时间线；正文/diff/子代理条/异常提示是独立段。
 * 空过程块（无文本的思考、无调用的工具块）不产生段、不打断相邻段。
 */

export type ProcessTurnBlock = Extract<TurnBlock, { kind: 'thinking' | 'tools' }>;
export type StandaloneTurnBlock = Exclude<TurnBlock, ProcessTurnBlock>;

export type TurnRun =
  | { kind: 'process'; blocks: readonly ProcessTurnBlock[] }
  | { kind: 'single'; block: StandaloneTurnBlock };

function isProcessBlock(block: TurnBlock): block is ProcessTurnBlock {
  return block.kind === 'thinking' || block.kind === 'tools';
}

function hasProcessContent(block: ProcessTurnBlock): boolean {
  if (block.kind === 'thinking') return block.text.length > 0;
  return block.calls.length > 0;
}

export function processRuns(blocks: readonly TurnBlock[]): readonly TurnRun[] {
  const runs: TurnRun[] = [];
  let pending: ProcessTurnBlock[] = [];
  const flush = (): void => {
    if (pending.length === 0) return;
    runs.push({ kind: 'process', blocks: pending });
    pending = [];
  };
  for (const block of blocks) {
    if (!isProcessBlock(block)) {
      flush();
      runs.push({ kind: 'single', block });
      continue;
    }
    if (!hasProcessContent(block)) continue;
    pending.push(block);
  }
  flush();
  return runs;
}
