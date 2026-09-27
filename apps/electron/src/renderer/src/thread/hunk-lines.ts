import type { EditHunkView } from '@paiapp/contracts';

/**
 * 补丁片段 → 展示行：原文行标删除（红）、新文行标新增（绿），其余按原样。
 * 逐行铺开而不是整块着色——一行一行的对照才看得出「改了哪几行」；
 * 空片段（纯新增/纯删除的一侧）不出伪空行。
 * index 是片段在列表中的位置，进 key 保证多片段行的 React 身份稳定。
 */

export type HunkLine = {
  key: string
  text: string
  tone: 'remove' | 'add' | 'plain'
}

/** 按行号分行（丢弃末尾空行：原文/新文多以换行结尾，不是内容行）。 */
function splitLines(text: string): string[] {
  if (text.length === 0) return [];
  const lines = text.split('\n');
  while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  return lines;
}

/** 单个片段 → 展示行（删除段在前、新增段在后，与 diff 习惯一致）。 */
export function hunkLines(hunk: EditHunkView, index: number): HunkLine[] {
  const removed = splitLines(hunk.oldText).map((text, line) => ({
    key: `${index}-r${line}`,
    text,
    tone: 'remove' as const,
  }));
  const added = splitLines(hunk.newText).map((text, line) => ({
    key: `${index}-a${line}`,
    text,
    tone: 'add' as const,
  }));
  if (removed.length === 0 && added.length === 0) {
    return [{ key: `${index}-empty`, text: hunk.oldText, tone: 'plain' as const }];
  }
  return [...removed, ...added];
}
