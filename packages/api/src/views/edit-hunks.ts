import { clipText, type EditHunkView } from '@paiapp/contracts';

/**
 * edit 工具参数 → 补丁片段对。x-harness edit 工具入参 {path, edits:[{oldText, newText}]}：
 * 每次精确文本替换是一对原文/新文——渲染层据此展示「改了什么」而不是整个文件
 * （模型要求 oldText 尽量小，片段本身就是最小改动面）。
 *
 * path 逐片段携带：模型常对同一文件连续调用 edit，渲染层以 path 为主键把
 * 多次编辑合成一个 diff（GitHub 的「一个文件一个 diff」），而不是按调用拆成多块。
 * 缺 path（垃圾形状）降级为空串——归并时视作未知路径，各自成块。
 *
 * write 工具是整文件重写、无基线可比，不在此列（其 diff 走行数统计）。
 */

/** 单片段字符上限：超长片段是模型违规（大段重写），截断保展示面稳定。 */
const HUNK_CHARS = 2000;
/** 片段对数量上限：参数里的 edits 数组无界，展示面需有上界。 */
const MAX_HUNKS = 8;

/** edit 工具名（大小写不敏感：协议侧小写，扩展出现过 Edit）。 */
const EDIT_TOOL = 'edit';

/** 单条 edits 元素 → 片段对；缺 oldText/newText 或非对象降级 null。 */
function hunkOf(value: unknown, path: string): EditHunkView | null {
  if (typeof value !== 'object' || value === null) return null;
  const record = value as Record<string, unknown>;
  const oldText = record['oldText'];
  const newText = record['newText'];
  if (typeof oldText !== 'string' || typeof newText !== 'string') return null;
  if (oldText === newText) return null;
  return { oldText: clip(oldText), newText: clip(newText), path };
}

/** 截断（不劈代理对 + 超限加省略号）：走 contracts 共享实现。
 * 省略号是必需的——静默截断会让 diff 面的红绿行数骗人（曾把 5000 字的
 * 大段重写显示成「删 1999 字」，用户无从得知还有 3000 字被吃掉）。 */
function clip(text: string): string {
  return clipText(text, HUNK_CHARS);
}

/** edit 工具入参 → 补丁片段对；非 edit 工具或垃圾形状返回空数组。 */
export function editHunksOf(name: string, args: Record<string, unknown>): EditHunkView[] {
  if (name.trim().toLowerCase() !== EDIT_TOOL) return [];
  const edits = args['edits'];
  if (!Array.isArray(edits)) return [];
  const rawPath = args['path'];
  const path = typeof rawPath === 'string' ? rawPath : '';
  const hunks: EditHunkView[] = [];
  for (const item of edits) {
    if (hunks.length >= MAX_HUNKS) break;
    const hunk = hunkOf(item, path);
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
