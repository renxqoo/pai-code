import type { EditHunkView } from '@paiapp/contracts';

/**
 * 补丁片段 → 展示行：原文行标删除（红）、新文行标新增（绿），其余按原样。
 * 逐行铺开而不是整块着色——一行一行的对照才看得出「改了哪几行」；
 * 空片段（纯新增/纯删除的一侧）不出伪空行。
 * startsHunk 标出片段首行：渲染层据此在段间画分隔线（一次编辑含多段补丁时，
 * 它们属于同一处改动，不该渲染成几个独立方块）。
 * index 是片段在列表中的位置，进 key 保证多片段行的 React 身份稳定。
 */

export type HunkLine = {
  key: string;
  text: string;
  tone: 'remove' | 'add' | 'plain';
  /** 本行是所属片段的首行，且**不是**本次编辑的第一个片段（渲染层据此画段间分隔线） */
  startsHunk: boolean;
};

/**
 * 按行分行：统一 CRLF/CR/LF（`\r` 残留会在复制出的 diff 里变成 `^M`），
 * 并丢弃**末尾**空行（片段常以换行结尾，那不是内容行）。
 * 片段本身是「纯换行」时（插入/删除一个空行——最常见的编辑之一），
 * 返回一行空格占位：让它落进兜底分支会把含 `\n` 的原文塞进单行渲染，
 * pre-wrap 下渲成一个双倍高的空白块且无红绿提示。
 */
function splitLines(text: string): string[] {
  if (text.length === 0) return [];
  const lines = text.split(/\r\n|\r|\n/);
  while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  if (lines.length === 0) return [' '];
  return lines;
}

/** 单个片段 → 展示行（删除段在前、新增段在后，与 diff 习惯一致）。 */
export function hunkLines(hunk: EditHunkView, index: number): HunkLine[] {
  const removed = splitLines(hunk.oldText).map((text, line) => ({
    key: `${index}-r${line}`,
    text,
    tone: 'remove' as const,
    startsHunk: line === 0,
  }));
  const added = splitLines(hunk.newText).map((text, line) => ({
    key: `${index}-a${line}`,
    text,
    tone: 'add' as const,
    startsHunk: removed.length === 0 && line === 0,
  }));
  if (removed.length === 0 && added.length === 0) {
    return [{ key: `${index}-empty`, text: hunk.oldText, tone: 'plain' as const, startsHunk: true }];
  }
  return [...removed, ...added];
}

/**
 * 多片段 → 全部展示行（一次编辑的全部补丁，铺进同一个容器）。
 * 只有第 2 个及以后的片段首行带 startsHunk——第一个片段的顶边就是容器边，
 * 再画一条线会在容器口上多出一道横杠。
 */
export function allHunkLines(hunks: readonly EditHunkView[]): HunkLine[] {
  return hunks.flatMap((hunk, index) =>
    hunkLines(hunk, index).map((line) => ({ ...line, startsHunk: index > 0 && line.startsHunk })),
  );
}
