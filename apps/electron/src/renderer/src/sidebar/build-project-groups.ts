import type { SessionCardModel } from '@/sidebar/session-card-model';

/** 项目视图单组模型：文件夹行 + 组内可见会话（显示更多折叠面已应用）。 */
export type ProjectGroup = {
  /** 组键 = 工作目录（cwd）：同名不同路径的项目不并组；折叠集合也按此键寻址。 */
  key: string;
  /** 文件夹行显示名（cwd 的 basename）。 */
  projectName: string;
  /** 组内可见会话（未展开且超限时为前 limit 条，展开为全量）。 */
  visible: readonly SessionCardModel[];
  /** 组内全量会话数（total > visible.length 时显示「显示更多」）。 */
  total: number;
  expanded: boolean;
  /** 组内最近活跃时间（组间排序依据，与截断无关）。 */
  latestActivityAt: number;
};

/** 项目组默认展示条数上限（超出折叠为前 N 条，展开显示全量）。 */
export const SHOW_MORE_LIMIT = 5;

/**
 * 项目视图分组：排除置顶会话后按 cwd 分组（同名异目录不并组，显示名取 basename）；
 * 组内最近活跃倒序，组间按各组最近活跃倒序（输入顺序不构成前提）。超 limit 且未展开的组
 * 截断为前 limit 条；limit 钳制为非负（负数等价全折叠不可见）。
 */
export function buildProjectGroups(
  sessions: readonly SessionCardModel[],
  pinnedPaths: ReadonlySet<string>,
  expanded: ReadonlySet<string>,
  limit: number = SHOW_MORE_LIMIT,
): readonly ProjectGroup[] {
  const cappedLimit = Math.max(0, limit);
  const byCwd = new Map<string, SessionCardModel[]>();
  for (const session of sessions) {
    if (session.sessionPath !== null && pinnedPaths.has(session.sessionPath)) continue;
    const list = byCwd.get(session.cwd) ?? [];
    list.push(session);
    byCwd.set(session.cwd, list);
  }
  const groups: ProjectGroup[] = [];
  for (const [cwd, list] of byCwd) {
    list.sort((a, b) => b.lastActivityAt - a.lastActivityAt);
    const isExpanded = expanded.has(cwd);
    groups.push({
      key: cwd,
      projectName: list[0]?.projectName ?? cwd,
      visible: isExpanded || list.length <= cappedLimit ? list : list.slice(0, cappedLimit),
      total: list.length,
      expanded: isExpanded,
      latestActivityAt: list[0]?.lastActivityAt ?? 0,
    });
  }
  // 组间按各组最近活跃倒序
  groups.sort((a, b) => b.latestActivityAt - a.latestActivityAt);
  return groups;
}
