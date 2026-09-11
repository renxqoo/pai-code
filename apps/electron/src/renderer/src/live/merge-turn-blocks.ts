/**
 * 尾 span 合入在途轮的块并集（T35 M2a）。
 *
 * 背景：转写（已落盘）与事件流（在途）是同一轮的两种成熟度。刷新落在轮次进行中时，
 * 本轮已落盘的前缀（较早的 assistant 消息、工具调用与结果）只存在于转写里，而在途轮
 * 只含刷新后的增量。此前的处置是「尾 span 归 live 轮独占——不插入」，即用**删内容**
 * 换取「不双渲染」。这里改为幂等并集：同一消息在三处（转写/在途快照/增量流）共用块
 * 身份（`messageTs`），因此合并不可能双渲染，也就不必再丢内容。
 *
 * 权威序（逐块/逐调用裁决）：
 * - 块 id 已存在 → 保留 live（live 是同一消息的较新成熟度）；
 * - tools 块同 id → 按 callId 并集：live 已有的调用整体保留（其 output 来自 tool_end
 *   权威帧、durationMs 是客户端观测值），live 不认识的 callId 才采信转写（transcript
 *   的 output 来自 toolResult 条目）——**不得**整体采信转写：对「结果未落」与「跑完但
 *   输出为空」它不可区分，会把还在跑的工具砸成「完成 + 空输出」；
 * - diff 块恒挂轮末（与 `buildTurnBlocks`/`foldThreadEvent` 的尾部不变式同构），文件按
 *   path 并集（转写为权威：它只收已结束调用的变更）。
 */
import type { TurnBlock } from '@/thread/thread-model';
import { mergeDiffFile } from './hydrate-items';
import { mergeAppendOnlyText, unionToolCalls } from './turn-ops';

export function mergeSpanBlocks(live: readonly TurnBlock[], span: readonly TurnBlock[]): TurnBlock[] {
  if (span.length === 0) return [...live];
  const liveById = new Map(live.map((block) => [block.id, block] as const));
  const prepend: TurnBlock[] = [];

  for (const block of span) {
    const existing = liveById.get(block.id);
    if (existing === undefined) {
      prepend.push(block);
      continue;
    }
    if (existing.kind === 'tools' && block.kind === 'tools') {
      liveById.set(block.id, { ...existing, calls: unionToolCalls(existing.calls, block.calls) });
      continue;
    }
    // 正文/思考：同一消息的两种成熟度按 append-only 拼接（转写是权威前缀，live 是较新增量；
    // 一律保 live 会把转写里的完整前缀丢掉，刷新后正文反而变短）
    if ((existing.kind === 'text' && block.kind === 'text') || (existing.kind === 'thinking' && block.kind === 'thinking')) {
      liveById.set(block.id, { ...existing, text: mergeAppendOnlyText(block.text, existing.text) });
    }
  }

  const merged = live.map((block) => liveById.get(block.id) ?? block);
  const diff = mergeDiffBlocks(merged, prepend);
  const content = [...prepend.filter((block) => block.kind !== 'diff'), ...merged.filter((block) => block.kind !== 'diff')];
  return diff === null ? content : [...content, diff];
}

/** diff 恒尾：live 与 span 的文件按 path 并集，转写侧的值覆盖（已结束调用的权威）。 */
function mergeDiffBlocks(merged: readonly TurnBlock[], prepend: readonly TurnBlock[]): TurnBlock | null {
  const liveDiff = merged.find((block) => block.kind === 'diff');
  const spanDiffs = prepend.filter((block) => block.kind === 'diff');
  if (liveDiff === undefined && spanDiffs.length === 0) return null;
  const files: Array<{ path: string; additions: number; deletions: number }> = liveDiff === undefined
    ? []
    : liveDiff.diff.files.map((file) => ({ ...file }));
  for (const block of spanDiffs) {
    if (block.kind !== 'diff') continue;
    for (const file of block.diff.files) mergeDiffFile(files, file.path, file.additions, file.deletions);
  }
  return {
    kind: 'diff',
    id: liveDiff?.id ?? (spanDiffs[0]?.kind === 'diff' ? spanDiffs[0].id : 'diff-span'),
    diff: {
      changedFiles: files.length,
      additions: files.reduce((sum, file) => sum + file.additions, 0),
      deletions: files.reduce((sum, file) => sum + file.deletions, 0),
      files,
    },
  };
}
