import type { EditHunkView } from '@paiapp/contracts';

/**
 * edit 工具参数 → 补丁片段对。x-harness edit 工具入参 {path, edits:[{oldText, newText}]}：
 * 每次精确文本替换是一对原文/新文——渲染层据此展示「改了什么」而不是整个文件
 * （模型要求 oldText 尽量小，片段本身就是最小改动面）。
 * write 工具是整文件重写、无基线可比，不在此列（其 diff 走行数统计）。
 * 垃圾形状（非数组、缺字段、片段过长）降级为空数组，不抛不崩。
 */

/** 单片段字符上限：超长片段是模型违规（大段重写），截断保展示面稳定。 */
const HUNK_CHARS = 2000;
/** 片段对数量上限：参数里的 edits 数组无界，展示面需有上界。 */
const MAX_HUNKS = 8;

/** edit 工具名（大小写不敏感：协议侧小写，扩展出现过 Edit）。 */
const EDIT_TOOL = 'edit';

/** 单条 edits 元素 → 片段对；缺 oldText/newText 或非对象降级 null。 */
function hunkOf(value: unknown): EditHunkView | null {
  if (typeof value !== 'object' || value === null) return null;
  const record = value as Record<string, unknown>;
  const oldText = record['oldText'];
  const newText = record['newText'];
  if (typeof oldText !== 'string' || typeof newText !== 'string') return null;
  if (oldText === newText) return null;
  return { oldText: clip(oldText), newText: clip(newText) };
}

/** UTF-16 截断（不劈代理对）：与 args-preview 同口径。 */
function clip(text: string): string {
  if (text.length <= HUNK_CHARS) return text;
  const cut = text.slice(0, HUNK_CHARS - 1);
  const last = cut.charCodeAt(cut.length - 1);
  const loneHighSurrogate = last >= 0xd800 && last <= 0xdbff;
  return loneHighSurrogate ? cut.slice(0, -1) : cut;
}

/** edit 工具入参 → 补丁片段对；非 edit 工具或垃圾形状返回空数组。 */
export function editHunksOf(name: string, args: Record<string, unknown>): EditHunkView[] {
  if (name.trim().toLowerCase() !== EDIT_TOOL) return [];
  const edits = args['edits'];
  if (!Array.isArray(edits)) return [];
  const hunks: EditHunkView[] = [];
  for (const item of edits) {
    if (hunks.length >= MAX_HUNKS) break;
    const hunk = hunkOf(item);
    if (hunk !== null) hunks.push(hunk);
  }
  return hunks;
}

/** 工具调用视图的 editHunks 字段：展开为空时不携带（wire 精简，与 subagents 同一约定）。 */
export function editHunksField(
  name: string,
  args: Record<string, unknown>,
): { editHunks?: EditHunkView[] } {
  const hunks = editHunksOf(name, args);
  return hunks.length > 0 ? { editHunks: hunks } : {};
}
