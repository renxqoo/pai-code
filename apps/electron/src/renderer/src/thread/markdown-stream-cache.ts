import { parseMarkdownIntoBlocks } from 'streamdown';

import { hasMathDelimiter } from './math-delimiters';
import { hasMermaidFence } from './mermaid-fence';

/**
 * 流式 markdown 块冻结缓存（纯函数状态机，T37）。
 *
 * 上游切刀（streamdown 的 parseMarkdownIntoBlocks）每次渲染对全文跑 marked Lexer
 * （~0.09ms/KB 线性）——流式期间每 delta 全量重切。本缓存利用 store appendDelta 的
 * append-only 不变量增量切尾：只对未冻结的尾区重切，稳态成本 O(尾块)；冻结区是
 * 原文的真字符切片，内容永不再变，渲染层 memo 零重渲。
 *
 * 两条正确性铁律（性质测试钉住）：
 * 1. 块串只是「边界预言」不是存储形态——marked 的 token.raw 对部分输入不忠实
 *    （如未完结列表项会合成尾换行），冻结/尾区一律按原文偏移切，拼接恒等于全文；
 * 2. 只有「空行终止」的块才可冻结——markdown 没有任何块级构造能跨越空行延续
 *    （setext/懒续行/围栏都止于空行），空行边界在任意后续全文词法中都是硬边界。
 */

export type MarkdownStreamCache = {
  /** 缓存对应的全文（幂等键：同 text 返回同引用）。 */
  readonly text: string;
  /** 已冻结块（真字符切片；拼接 + tail = text）。 */
  readonly frozen: readonly string[];
  /** 实时尾区（真字符切片；每 delta 重切重渲的唯一区域）。 */
  readonly tail: string;
  /** GFM 脚注命中：整文单块回退（对齐上游快速路径；脚注解析需整文档上下文）。 */
  readonly footnote: boolean;
  /** `$$` 公式闩锁（append-only 命中即置位；非前缀替换时全量重扫复位）。 */
  readonly math: boolean;
  /** mermaid 围栏闩锁（同上）。 */
  readonly mermaid: boolean;
  /** CRLF 行尾闩锁：marked 的 token.raw 已剥 \r，raw 忠实复核必然失配——直接
   *  单块形态（跳过词法，成本与块冻结之前持平）；非前缀替换时重扫复位。 */
  readonly crlf: boolean;
};

const EMPTY_BLOCKS: readonly string[] = [];

/** GFM 脚注标记（引用 `[^id]` 或定义 `[^id]:`，id 上限对齐上游 1-200 字符）。
 *  导出供守卫测试：本地判据必须与上游切刀的脚注快速路径保持等价（上游耦合面）。 */
export const MARKDOWN_FOOTNOTE_MARKER = /\[\^[\w-]{1,200}\]/;
/** 标记跨 delta 边界的扫描重叠窗：覆盖脚注 id 上限 + 围栏/定界符长度。 */
const MARKER_OVERLAP_CHARS = 256;

/**
 * 求尾区的可冻结前缀长度（字符数）：沿块序列推进累计偏移，边界可冻结的判据是
 * 「原文在该偏移处恰以空行终止」——markdown 没有任何块级构造能跨空行延续
 * （setext/懒续行/围栏都止于空行），空行边界在任意后续全文词法中都是硬边界。
 * 推进时逐块复核 raw 与原文逐字吻合：marked 的 token.raw 对部分形态不忠实
 * （如未完结列表项合成尾换行），失真即止步（保守少冻结，不失正确性）。
 */
function freezeCut(region: string): number {
  const blocks = parseMarkdownIntoBlocks(region);
  let cursor = 0;
  let cut = 0;
  for (let index = 0; index < blocks.length - 1; index += 1) {
    const block = blocks[index];
    if (block === undefined) break;
    if (!region.startsWith(block, cursor)) break;
    cursor += block.length;
    if (region.charCodeAt(cursor - 1) === 10 && region.charCodeAt(cursor - 2) === 10) cut = cursor;
  }
  return cut;
}

export function nextMarkdownStreamCache(prev: MarkdownStreamCache | null, text: string): MarkdownStreamCache {
  if (prev?.text === text) return prev;
  const appended = prev !== null && text.startsWith(prev.text) ? text.slice(prev.text.length) : null;

  if (appended !== null && prev !== null) {
    // 闩锁只扫「重叠窗 + 增量」：标记可能跨 delta 边界（"$"+"$"、"[^i"+"d]"）
    const scanRegion = `${prev.text.slice(-MARKER_OVERLAP_CHARS)}${appended}`;
    const math = prev.math || hasMathDelimiter(scanRegion);
    const mermaid = prev.mermaid || hasMermaidFence(scanRegion);
    const crlf = prev.crlf || appended.includes('\r');
    if (prev.footnote || MARKDOWN_FOOTNOTE_MARKER.test(scanRegion)) {
      // 脚注需要整文档上下文（定义可在文末、引用在文首）：整文单块，frozen 恒空
      return { text, frozen: EMPTY_BLOCKS, tail: text, footnote: true, math, mermaid, crlf };
    }
    if (crlf) {
      // CRLF：raw 已被剥 \r，忠实复核必然失配，冻结永不成立——直接单块（零词法）
      return { text, frozen: EMPTY_BLOCKS, tail: text, footnote: false, math, mermaid, crlf };
    }
    const region = `${prev.tail}${appended}`;
    const cut = freezeCut(region);
    const frozen = cut === 0 ? prev.frozen : [...prev.frozen, region.slice(0, cut)];
    return { text, frozen, tail: region.slice(cut), footnote: false, math, mermaid, crlf };
  }

  // 首次渲染 / 非前缀变化（messageFinal 权威替换、截断）：全量重扫重切一次
  const math = hasMathDelimiter(text);
  const mermaid = hasMermaidFence(text);
  const crlf = text.includes('\r');
  if (MARKDOWN_FOOTNOTE_MARKER.test(text)) {
    return { text, frozen: EMPTY_BLOCKS, tail: text, footnote: true, math, mermaid, crlf };
  }
  if (crlf) {
    return { text, frozen: EMPTY_BLOCKS, tail: text, footnote: false, math, mermaid, crlf };
  }
  const cut = freezeCut(text);
  return { text, frozen: cut === 0 ? EMPTY_BLOCKS : [text.slice(0, cut)], tail: text.slice(cut), footnote: false, math, mermaid, crlf };
}