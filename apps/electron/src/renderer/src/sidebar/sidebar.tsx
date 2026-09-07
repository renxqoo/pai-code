import { SessionCard } from '@/sidebar/session-card';
import { SidebarFooter, type SidebarFooterAction } from '@/sidebar/sidebar-footer';
import { SidebarProjectsRow } from '@/sidebar/sidebar-projects-row';
import { SidebarSearchRow } from '@/sidebar/sidebar-search-row';
import type { SessionCardModel } from '@/sidebar/session-card-model';

import { cn } from '@/lib/utils';

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
  }
  sessions: readonly SessionCardModel[]
  ages: Readonly<Record<string, string>>
  activeSessionId: string
  projects: readonly string[]
  selectedProject: string
  footerActions: readonly [SidebarFooterAction, SidebarFooterAction, SidebarFooterAction]
  refreshAction: SidebarFooterAction
  onSearch: () => void
  onNewThread: () => void
  onSelectProject: (project: string) => void
  onNewProject: () => void
  onSelectSession: (sessionId: string) => void
}

/** 会话侧栏：搜索、项目筛选、会话列表与底部工具；标题行由窗口顶栏承担。 */
function Sidebar({
  width,
  collapsed,
  labels,
  sessions,
  ages,
  activeSessionId,
  projects,
  selectedProject,
  footerActions,
  refreshAction,
  onSearch,
  onNewThread,
  onSelectProject,
  onNewProject,
  onSelectSession,
}: SidebarProps) {
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
          onSearch={onSearch}
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
        <div className="mt-1 flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pb-2">
          {sessions.map((item) => (
            <SessionCard
              key={item.id}
              session={item}
              age={ages[item.id] ?? ''}
              active={item.id === activeSessionId}
              onSelect={() => onSelectSession(item.id)}
            />
          ))}
        </div>
      </div>
      <SidebarFooter actions={footerActions} refresh={refreshAction} />
    </aside>
  );
}

export { Sidebar };
