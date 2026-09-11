import * as React from 'react';
import { useStore } from 'zustand';

import { copy } from '@/strings';
import { MODIFIER_KEY_LABEL } from '@/lib/platform';
import { store as liveStore } from '@/live/workspace-runtime';
import { sessionCardsOf } from '@/sidebar/session-cards';
import { PinnedSection } from '@/sidebar/pinned-section';
import { ProjectSection } from '@/sidebar/project-section';
import { SessionRow } from '@/sidebar/session-row';
import { buildSidebarViewModel } from '@/screens/sidebar-view-model';
import { useSessionAges } from '@/hooks/use-session-ages';
import { uiStore } from '@/ui/ui-store';

/**
 * 会话列表区域：live store（会话注册表/偏好/活跃线程）与 ui store（查询/视图/
 * 显示更多展开）的自订阅组装点——视图模型经 buildSidebarViewModel 单一真相派生，
 * 相对时间 tick（30s）收敛在本区域内，不外溢工作区树。空态文案直读 copy。
 */
function SessionListRegion(): React.JSX.Element {
  const sessionViews = useStore(liveStore, (s) => s.sessions);
  const preferences = useStore(liveStore, (s) => s.preferences);
  const activeThreadId = useStore(liveStore, (s) => s.activeThreadId) ?? '';
  const query = useStore(uiStore, (s) => s.sidebarQuery);
  const view = useStore(uiStore, (s) => s.sidebarView);
  const expanded = useStore(uiStore, (s) => s.sidebarGroupFold.expanded);

  const sessions = sessionCardsOf(sessionViews);
  // 集合依赖收细到具体数组：无关偏好字段变化（如 trustedDefault）不重算视图模型
  const pinnedPaths = React.useMemo(() => new Set(preferences.pinnedSessions), [preferences.pinnedSessions]);
  const hiddenProjects = React.useMemo(() => new Set(preferences.hiddenProjects), [preferences.hiddenProjects]);
  const archivedSessions = React.useMemo(() => new Set(preferences.archivedSessions), [preferences.archivedSessions]);
  const lists = React.useMemo(
    () => buildSidebarViewModel(sessions, hiddenProjects, pinnedPaths, archivedSessions, query, expanded),
    [sessions, hiddenProjects, pinnedPaths, archivedSessions, query, expanded],
  );
  const { pinned, timeList, projectGroups, emptyState } = lists;
  const ages = useSessionAges(sessions);

  if (emptyState === 'filtered') {
    return (
      <p className="px-2 pt-6 text-center text-[11.5px] leading-[16px] text-muted-foreground/80">
        {copy.sidebar.noMatches}
      </p>
    );
  }
  if (emptyState === 'none') {
    return (
      <p className="px-2 pt-6 text-center text-[11.5px] leading-[16px] text-muted-foreground/80">
        {copy.sidebar.emptyTasks(copy.sidebar.hotkeyNewTask(MODIFIER_KEY_LABEL))}
      </p>
    );
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 pt-2 pb-2">
      {pinned.length > 0 ? <PinnedSection sessions={pinned} ages={ages} activeSessionId={activeThreadId} /> : null}
      {view === 'grouped' ? (
        /* 平铺行与置顶区/项目组内行同一间距节律（gap-[2px]），容器 gap-2 只负责区隔各分区 */
        <section className="flex flex-col gap-[2px]">
          {timeList.map((session) => (
            <SessionRow
              key={session.id}
              session={session}
              age={ages[session.id] ?? ''}
              active={session.id === activeThreadId}
            />
          ))}
        </section>
      ) : projectGroups.length > 0 ? (
        <>
          <div className="px-2 pt-1 pb-[2px] text-[11.5px] leading-none text-muted-foreground">
            {copy.sidebar.viewProjects}
          </div>
          {projectGroups.map((group) => (
            <ProjectSection key={group.key} group={group} ages={ages} activeSessionId={activeThreadId} />
          ))}
        </>
      ) : null}
    </div>
  );
}

const SessionListRegionMemo = React.memo(SessionListRegion);
export { SessionListRegionMemo as SessionListRegion };
