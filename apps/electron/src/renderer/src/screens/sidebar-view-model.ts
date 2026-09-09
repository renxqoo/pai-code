import { excludeHiddenProjects } from '@/sidebar/hidden-projects';
import { filterSessions } from '@/sidebar/filter-sessions';
import { buildPinnedList } from '@/sidebar/build-pinned-list';
import { buildTimeList } from '@/sidebar/build-time-list';
import { buildProjectGroups } from '@/sidebar/build-project-groups';
import type { SessionCardModel } from '@/sidebar/session-card-model';

export type SidebarViewModel = {
  visible: readonly SessionCardModel[];
  pinned: readonly SessionCardModel[];
  timeList: readonly SessionCardModel[];
  projectGroups: ReturnType<typeof buildProjectGroups>;
};

/**
 * 侧栏列表视图模型（T17/T18）：隐藏项目过滤 → 查询过滤 →
 * 置顶 / 分组平铺 / 项目分组三列表（置顶项不重复出现在列表）。
 */
export function buildSidebarViewModel(
  sessions: readonly SessionCardModel[],
  hiddenProjects: ReadonlySet<string>,
  pinnedPaths: ReadonlySet<string>,
  query: string,
  expanded: ReadonlySet<string>,
): SidebarViewModel {
  const visible = filterSessions(excludeHiddenProjects(sessions, hiddenProjects), query);
  return {
    visible,
    pinned: buildPinnedList(visible, pinnedPaths),
    timeList: buildTimeList(visible, pinnedPaths),
    projectGroups: buildProjectGroups(visible, pinnedPaths, expanded),
  };
}
