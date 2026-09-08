import * as React from 'react';
import { SessionCard } from '@/sidebar/session-card';
import { SessionGroupHeader } from '@/sidebar/session-group-header';
import { SidebarFooter, type SidebarFooterAction } from '@/sidebar/sidebar-footer';
import { SidebarProjectsRow } from '@/sidebar/sidebar-projects-row';
import { SidebarSearchRow } from '@/sidebar/sidebar-search-row';
import type { SessionCardModel } from '@/sidebar/session-card-model';

import { cn } from '@/lib/utils';
import { copy } from '@/strings';

type SidebarProps = {
  width: number
  collapsed: boolean
  labels: {
    search: string
    newThread: string
    allProjects: string
    newProject: string
    settings: string
    workflows: string
    usage: string
    refresh: string
    clearSearch: string
  }
  /** 项目分组（key = projectName，组内已排序；折叠由外层状态持有） */
  groups: ReadonlyArray<{
    key: string
    projectName: string
    sessions: readonly SessionCardModel[]
    collapsed: boolean
    onToggle: () => void
  }>
  ages: Readonly<Record<string, string>>
  activeSessionId: string
  projects: readonly string[]
  selectedProject: string
  /** 会话过滤查询（受控）：空串 = 不过滤 */
  searchQuery: string
  onSearchQueryChange: (value: string) => void
  /** 过滤后无命中时的空态文案 */
  filterEmptyLabel: string
  footerActions: readonly [SidebarFooterAction, SidebarFooterAction, SidebarFooterAction]
  refreshAction: SidebarFooterAction
  onNewThread: () => void
  onSelectProject: (project: string) => void
  onNewProject: () => void
  onSelectSession: (sessionId: string) => void
  /** 关闭会话（dispose，文件保留）；不传则卡片不显示关闭入口。 */
  onCloseSession?: (sessionId: string) => void
  /** 重命名会话；不传则卡片不显示重命名入口。 */
  onRenameSession?: (sessionId: string, name: string) => void
}

/** 会话侧栏：搜索、项目筛选、按项目分组的会话列表与底部工具；标题行由窗口顶栏承担。 */
function Sidebar({
  width,
  collapsed,
  labels,
  groups,
  ages,
  activeSessionId,
  projects,
  selectedProject,
  searchQuery,
  onSearchQueryChange,
  filterEmptyLabel,
  footerActions,
  refreshAction,
  onNewThread,
  onSelectProject,
  onNewProject,
  onSelectSession,
  onCloseSession,
  onRenameSession,
}: SidebarProps) {
  const filtering = searchQuery.trim().length > 0;
  const totalSessionCount = groups.reduce((sum, group) => sum + group.sessions.length, 0);
  return (
    <aside
      style={{ width: collapsed ? 0 : width }}
      className={cn(
        'flex h-full min-h-0 shrink-0 flex-col overflow-hidden border-sidebar-border bg-sidebar transition-[width] duration-200 motion-reduce:transition-none',
        collapsed ? 'border-r-0' : 'border-r',
      )}
    >
      {/* 顶行由 fixed 标题覆盖块承担，这里只留等高占位 */}
      <div aria-hidden="true" className="h-[46px] shrink-0" />
      <div className="flex min-h-0 flex-1 flex-col px-2 pt-1">
        <SidebarSearchRow
          searchLabel={labels.search}
          newThreadLabel={labels.newThread}
          clearLabel={labels.clearSearch}
          query={searchQuery}
          onQueryChange={onSearchQueryChange}
          onNewThread={onNewThread}
        />
        <SidebarProjectsRow
          allProjectsLabel={labels.allProjects}
          newProjectLabel={labels.newProject}
          projects={projects}
          selectedProject={selectedProject}
          onSelectProject={onSelectProject}
          onNewProject={onNewProject}
        />
        {filtering && totalSessionCount === 0 ? (
          <p className="px-2 pt-6 text-center text-[11.5px] leading-[16px] text-muted-foreground/80">{filterEmptyLabel}</p>
        ) : (
          <div className="mt-1 flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pb-2">
            {groups.map((group) => (
              <div key={group.key} className="flex flex-col gap-1.5">
                <SessionGroupHeader
                  projectName={group.projectName}
                  count={group.sessions.length}
                  collapsed={group.collapsed}
                  onToggle={group.onToggle}
                  ariaLabel={`${copy.sidebar.collapseGroup} · ${group.projectName}`}
                />
                {group.collapsed
                  ? null
                  : group.sessions.map((item) => (
                      <SessionCard
                        key={item.id}
                        session={item}
                        age={ages[item.id] ?? ''}
                        active={item.id === activeSessionId}
                        onSelect={() => onSelectSession(item.id)}
                        onClose={onCloseSession === undefined ? undefined : () => onCloseSession(item.id)}
                        onRename={onRenameSession === undefined ? undefined : (name) => onRenameSession(item.id, name)}
                      />
                    ))}
              </div>
            ))}
          </div>
        )}
      </div>
      <SidebarFooter actions={footerActions} refresh={refreshAction} />
    </aside>
  );
}

const SidebarMemo = React.memo(Sidebar);
export { SidebarMemo as Sidebar };
