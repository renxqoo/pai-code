import type { EditHunkView } from '@paiapp/contracts';

/**
 * 编辑调用 → 按文件归并的 diff 组（GitHub 形态：一个文件一个 diff）。
 *
 * 模型对同一文件常连续调用 edit（改一处、再改一处）。按调用逐行展示会让
 * 「一个文件被改了两次」读成两个独立代码块；这里以 path 为主键把多次编辑
 * 合成一组，组内补丁按首次出现顺序堆叠——顺序即编辑顺序，diff 语义正确。
 *
 * 归并键为空串（入参缺 path 的垃圾形状）时**不归并**：无法判断是否同一文件，
 * 各自成组比赌一把安全。
 */

export type FileDiffGroup = {
  /** 文件路径（未知路径时为合成键，组间不重复） */
  path: string
  /** 本组的全部补丁（多次编辑的片段按序堆叠） */
  hunks: readonly EditHunkView[]
}

/** 未知路径的合成键前缀：真实路径不会以此开头，故不会与真实路径撞键。 */
const UNKNOWN_PREFIX = 'unknown-path-';

/**
 * 编辑调用列表 → 按文件归并的 diff 组。
 * 空调用列表返回空数组（调用方据此不渲染任何 diff 区）。
 */
export function groupEditsByFile(
  calls: readonly { readonly editHunks: readonly EditHunkView[] }[],
): FileDiffGroup[] {
  const groups: FileDiffGroup[] = [];
  const byPath = new Map<string, number>();
  let unknownSeq = 0;
  for (const call of calls) {
    for (const hunk of call.editHunks) {
      const key = hunk.path.length > 0 ? hunk.path : `${UNKNOWN_PREFIX}${unknownSeq++}`;
      const at = byPath.get(key);
      if (at === undefined) {
        byPath.set(key, groups.length);
        groups.push({ path: hunk.path, hunks: [hunk] });
        continue;
      }
      const group = groups[at];
      if (group === undefined) continue;
      groups[at] = { ...group, hunks: [...group.hunks, hunk] };
    }
  }
  return groups;
}
