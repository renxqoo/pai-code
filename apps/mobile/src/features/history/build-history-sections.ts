/**
 * 对话历史抽屉的项目分组：置顶单独成段，其余按工作目录（cwd）分组
 * ——同结构对齐桌面端侧栏 build-project-groups（同名不同目录不并组，显示名取
 * 目录末段名，组内按最近活动时间倒序，组间按各组最近活动时间倒序）。
 *
 * 分组是抽屉虚拟化的载体：SectionList 按 section 切窗口，会话总量再大也只有
 * 视口内的少数行会挂载。组内条数超过 SHOW_MORE_LIMIT 时折叠为前 N 条，由组末
 * 「显示更多」放全量（折叠与展开是两件事，见 group-fold-store）。
 */
import type { ConversationSession } from '@/types/domain';

/** 项目组默认展示条数上限（超出折叠为前 N 条，与桌面端侧栏同一上限）。 */
export const SHOW_MORE_LIMIT = 5;

/** 置顶段固定键（不与任何 cwd 冲突：cwd 为绝对路径）。 */
const PINNED_KEY = 'pinned';

export type HistorySection = {
  /** 分组键：置顶段固定为 'pinned'，项目段为会话的工作目录。 */
  key: string;
  kind: 'pinned' | 'project';
  /** 项目显示名（工作目录末段名）；置顶段为空串。 */
  title: string;
  /** 组内可见会话（整组折叠时为空数组；超限未展开时为前 N 条）。 */
  data: readonly ConversationSession[];
  /** 组内全量会话数（与折叠、截断无关——折叠态下仍显示真实条数）。 */
  total: number;
  /** 整组折叠（箭头收起，组内一条不展示）。 */
  collapsed: boolean;
  /** 已「显示更多」（组内全量放行）。 */
  expanded: boolean;
  /** 组内最近活动时间（组间排序依据，与截断无关）。 */
  latestActivityAt: number;
};

/** 工作目录显示名：末段目录名；目录为空（未选工作空间）时返回空串，由 UI 回落占位名。 */
export function projectNameOf(cwd: string): string {
  return cwd.split('/').filter((part) => part.length > 0).pop() ?? '';
}

const byActivityDesc = (a: ConversationSession, b: ConversationSession): number => (b.startedAtMs ?? 0) - (a.startedAtMs ?? 0);

const matchesQuery = (session: ConversationSession, query: string): boolean => query.length === 0 || `${session.title}${session.preview}${session.project}`.includes(query);

/**
 * 分段构建：置顶段在前（全部置顶会话，不受查询与归档过滤），其后是项目段。
 * 归档会话无查询时排除，有查询时并入（搜索要能搜到归档）。
 */
export function buildHistorySections(
  sessions: readonly ConversationSession[],
  query: string,
  collapsed: ReadonlySet<string>,
  expanded: ReadonlySet<string>,
  limit: number = SHOW_MORE_LIMIT,
): readonly HistorySection[] {
  const cappedLimit = Math.max(0, limit);
  const pinned: ConversationSession[] = [];
  const byProject = new Map<string, ConversationSession[]>();
  for (const session of sessions) {
    if (session.pinned) {
      pinned.push(session);
      continue;
    }
    if (session.archived && query.length === 0) continue;
    if (!matchesQuery(session, query)) continue;
    const list = byProject.get(session.project) ?? [];
    list.push(session);
    byProject.set(session.project, list);
  }
  const sections: HistorySection[] = [];
  if (pinned.length > 0) {
    pinned.sort(byActivityDesc);
    sections.push({ key: PINNED_KEY, kind: 'pinned', title: '', data: pinned, total: pinned.length, collapsed: false, expanded: true, latestActivityAt: pinned[0]?.startedAtMs ?? 0 });
  }
  const groups: HistorySection[] = [];
  for (const [cwd, list] of byProject) {
    list.sort(byActivityDesc);
    const isCollapsed = collapsed.has(cwd);
    const isExpanded = expanded.has(cwd);
    groups.push({
      key: cwd,
      kind: 'project',
      title: projectNameOf(cwd),
      data: isCollapsed ? [] : isExpanded || list.length <= cappedLimit ? list : list.slice(0, cappedLimit),
      total: list.length,
      collapsed: isCollapsed,
      expanded: isExpanded,
      latestActivityAt: list[0]?.startedAtMs ?? 0,
    });
  }
  groups.sort((a, b) => b.latestActivityAt - a.latestActivityAt);
  return [...sections, ...groups];
}