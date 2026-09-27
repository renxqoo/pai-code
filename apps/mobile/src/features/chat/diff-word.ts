import { diffWordsWithSpace } from 'diff';

import type { HunkLine } from '@paiapp/ui-thread';

export type WordPart = { readonly text: string; readonly changed: boolean };

/** 超长行走整行（词级对超长 diff 既慢又没可读性）。 */
const maxWordDiffChars = 2000;

/** 配对行的词级对照（T56 M3）：一行删除对一行新增（同段落内按序配对），
 * 两侧各自的差异词标出；未配对/超长行返回空表（调用方退整行着色）。 */
export function wordDiffByLine(lines: readonly HunkLine[]): ReadonlyMap<string, readonly WordPart[]> {
  const result = new Map<string, readonly WordPart[]>();
  let removes: HunkLine[] = [];
  let adds: HunkLine[] = [];
  const flush = (): void => {
    const paired = Math.min(removes.length, adds.length);
    for (let index = 0; index < paired; index += 1) {
      const removeLine = removes[index];
      const addLine = adds[index];
      if (removeLine === undefined || addLine === undefined) continue;
      result.set(removeLine.key, wordParts(removeLine.text, addLine.text, 'remove'));
      result.set(addLine.key, wordParts(removeLine.text, addLine.text, 'add'));
    }
    removes = [];
    adds = [];
  };
  for (const line of lines) {
    if (line.startsHunk && (removes.length > 0 || adds.length > 0)) flush();
    if (line.tone === 'remove') removes.push(line);
    else if (line.tone === 'add') adds.push(line);
    else flush();
  }
  flush();
  return result;
}

/** 单侧词级段：删除侧显「删了哪些词」，新增侧显「新加了哪些词」；其余原词不动。 */
export function wordParts(before: string, after: string, side: 'remove' | 'add'): readonly WordPart[] {
  const own = side === 'remove' ? before : after;
  if (before.length > maxWordDiffChars || after.length > maxWordDiffChars) {
    return [{ text: own, changed: false }];
  }
  const parts: WordPart[] = [];
  for (const change of diffWordsWithSpace(before, after)) {
    if (side === 'remove' && change.added) continue;
    if (side === 'add' && change.removed) continue;
    const changed = side === 'remove' ? change.removed === true : change.added === true;
    const last = parts[parts.length - 1];
    if (last?.changed === changed) parts[parts.length - 1] = { text: last.text + change.value, changed };
    else parts.push({ text: change.value, changed });
  }
  return parts;
}
