import type { TurnModel } from './thread-model';

/** 锚点摘要上限（码点数）：超出截断补省略号，tooltip 内最多两行。 */
const ANCHOR_SUMMARY_MAX = 96;

/** 折叠全部空白（含换行/制表）为单空格并去首尾。 */
function collapseWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/** 文本块的首个非空行：最终回答的首行（标题/结论句）最具概括性。 */
function firstNonEmptyLine(text: string): string {
  for (const line of text.split('\n')) {
    const collapsed = collapseWhitespace(line);
    if (collapsed.length > 0) return collapsed;
  }
  return '';
}

/** 按码点截断（不劈开代理对），超长补省略号；非正上限降级为空串。 */
export function truncateAnchorSummary(text: string, max: number = ANCHOR_SUMMARY_MAX): string {
  if (!Number.isFinite(max) || max <= 0) return '';
  const chars = Array.from(text.trim());
  if (chars.length <= max) return chars.join('');
  return `${chars.slice(0, max).join('')}…`;
}

/**
 * 历史轮锚点的摘要推导（tooltip 文本源）：
 * 最后一条非空文本块的首行（最终回答）→ 首个工具调用（名称 + 参数摘要）→
 * 首个子代理的报告摘要（缺失退工具名）→ 异常终态提示；全部缺失降级为空串，
 * 组件届时只展示轮次时刻。
 */
export function turnAnchorSummary(turn: Pick<TurnModel, 'blocks'>): string {
  for (let index = turn.blocks.length - 1; index >= 0; index -= 1) {
    const block = turn.blocks[index];
    if (block?.kind !== 'text') continue;
    const line = firstNonEmptyLine(block.text);
    if (line.length > 0) return truncateAnchorSummary(line);
  }
  for (const block of turn.blocks) {
    if (block.kind !== 'tools') continue;
    for (const call of block.calls) {
      const preview = collapseWhitespace(`${call.name} ${call.argsPreview}`);
      if (preview.length > 0) return truncateAnchorSummary(preview);
    }
  }
  for (const block of turn.blocks) {
    if (block.kind !== 'subagents') continue;
    for (const agent of block.agents) {
      const preview = collapseWhitespace(agent.summary.length > 0 ? agent.summary : agent.name);
      if (preview.length > 0) return truncateAnchorSummary(preview);
    }
  }
  for (const block of turn.blocks) {
    if (block.kind !== 'turnFailure') continue;
    const preview = collapseWhitespace(block.message ?? '');
    if (preview.length > 0) return truncateAnchorSummary(preview);
  }
  return '';
}
