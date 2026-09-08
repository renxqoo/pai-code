/** 项目组折叠面：collapsed = 文件夹行折叠集合；expanded = 「显示更多」已展开集合。 */
export type GroupFold = {
  collapsed: ReadonlySet<string>;
  expanded: ReadonlySet<string>;
};

/**
 * 文件夹行折叠切换：切到折叠时同步清该组「显示更多」展开态
 * （再展开回到截断视图）；切回展开不动 expanded。返回新对象，输入不动。
 */
export function toggleGroupFold(fold: GroupFold, key: string): GroupFold {
  const collapsed = new Set(fold.collapsed);
  const expanded = new Set(fold.expanded);
  if (collapsed.has(key)) {
    collapsed.delete(key);
  } else {
    collapsed.add(key);
    expanded.delete(key);
  }
  return { collapsed, expanded };
}

/** 「显示更多」展开（幂等：已展开返回原引用）。 */
export function expandGroup(fold: GroupFold, key: string): GroupFold {
  if (fold.expanded.has(key)) return fold;
  return { collapsed: fold.collapsed, expanded: new Set([...fold.expanded, key]) };
}
