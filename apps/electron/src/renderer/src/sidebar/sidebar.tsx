import * as React from 'react';

import { copy } from '@/strings';
import type { ProjectGroup } from '@/sidebar/build-project-groups';
import { PinnedSection } from '@/sidebar/pinned-section';
import { ProjectSection } from '@/sidebar/project-section';
import { QuickActionsRow } from '@/sidebar/quick-actions-row';
import { SessionRow } from '@/sidebar/session-row';
import { SidebarFooter, type SidebarFooterAction } from '@/sidebar/sidebar-footer';
import { SidebarSearchInput } from '@/sidebar/sidebar-search-input';
import type { SessionCardModel } from '@/sidebar/session-card-model';
import type { SidebarView } from '@/sidebar/sidebar-view';
import { ViewSwitchTabs } from '@/sidebar/view-switch-tabs';

import { cn } from '@/lib/utils';

type SidebarProps = {
  /** 容器宽度；collapsed 时收窄为 0（折叠由外层持有，过渡动画在 width 上）。 */
  width: number
  collapsed: boolean
  view: SidebarView
  onViewChange: (view: SidebarView) => void
  searchOpen: boolean
  onSearchOpenChange: (open: boolean) => void
  /** 快捷区「搜索」行入口：展开 + 聚焦（已展开时重新聚焦；含收起态展开侧栏）。 */
  onOpenSearch: () => void
  /** 聚焦信号：每次 ⌘K/快捷行触发递增，驱动已展开的搜索框重新聚焦。 */
  searchFocusToken: number
  /** 会话过滤查询（受控）：空串 = 不过滤。 */
  searchQuery: string
  onSearchQueryChange: (value: string) => void
  /** 置顶区数据（已排序），两视图共用，渲染在列表区顶部。 */
  pinned: readonly SessionCardModel[]
  /** 分组视图平铺数据（已排除置顶 + 最近活跃倒序）。 */
  timeList: readonly SessionCardModel[]
  /** 项目视图分组数据（已排除置顶；visible/total 见 ProjectGroup）。 */
  projectGroups: readonly ProjectGroup[]
  /** 折叠的项目分组 key 集合。 */
  collapsedGroups: ReadonlySet<string>
  onToggleGroupCollapse: (key: string) => void
  /** 「显示更多」：解除项目组可见条数截断。 */
  onExpandGroup: (key: string) => void
  /** 会话 id → 相对时间标签。 */
  ages: Readonly<Record<string, string>>
  activeSessionId: string
  /** 搜索非空且列表全空时的空态文案。 */
  filterEmptyLabel: string
  /** 零会话（非过滤）时的引导文案。 */
  emptyTasksLabel: string
  onNewThread: () => void
  onCollapseSidebar: () => void
  onSelectSession: (sessionId: string) => void
  /** 关闭会话（dispose，文件保留）；不传则行内不出现关闭入口。 */
  onCloseSession?: (sessionId: string) => void
  /** 重命名会话；不传则卡片不显示重命名入口。 */
  onRenameSession?: (sessionId: string, name: string) => void
  /** 置顶切换（键为 sessionPath）；sessionPath 为 null 的行无置顶入口。 */
  onTogglePin: (sessionPath: string) => void
  footerActions: readonly [SidebarFooterAction, SidebarFooterAction, SidebarFooterAction]
  refreshAction: SidebarFooterAction
}

/** 会话侧栏：快捷操作、视图切换（分组/项目）、置顶区与会话列表；标题行由窗口顶栏承担。 */
function Sidebar({
  width,
  collapsed,
  view,
  onViewChange,
  searchOpen,
  onSearchOpenChange,
  onOpenSearch,
  searchFocusToken,
  searchQuery,
  onSearchQueryChange,
  pinned,
  timeList,
  projectGroups,
  collapsedGroups,
  onToggleGroupCollapse,
  onExpandGroup,
  ages,
  activeSessionId,
  filterEmptyLabel,
  emptyTasksLabel,
  onNewThread,
  onCollapseSidebar,
  onSelectSession,
  onCloseSession,
  onRenameSession,
  onTogglePin,
  footerActions,
  refreshAction,
}: SidebarProps) {
  const filtering = searchQuery.trim().length > 0;
  const listEmpty =
    pinned.length === 0 && timeList.length === 0 && projectGroups.every((group) => group.total === 0);

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
        <QuickActionsRow onNewThread={onNewThread} onOpenSearch={onOpenSearch} />
        {searchOpen ? (
          <div className="pt-1.5">
            <SidebarSearchInput
              query={searchQuery}
              focusToken={searchFocusToken}
              onQueryChange={onSearchQueryChange}
              onClose={() => {
                onSearchQueryChange('');
                onSearchOpenChange(false);
              }}
            />
          </div>
        ) : null}
        <div className="pt-2.5">
          <ViewSwitchTabs view={view} onViewChange={onViewChange} onCollapseSidebar={onCollapseSidebar} />
        </div>
        {filtering && listEmpty ? (
          <p className="px-2 pt-6 text-center text-[11.5px] leading-[16px] text-muted-foreground/80">
            {filterEmptyLabel}
          </p>
        ) : !filtering && listEmpty ? (
          <p className="px-2 pt-6 text-center text-[11.5px] leading-[16px] text-muted-foreground/80">
            {emptyTasksLabel}
          </p>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pt-2 pb-2">
            {pinned.length > 0 ? (
              <PinnedSection
                sessions={pinned}
                ages={ages}
                activeSessionId={activeSessionId}
                onSelect={onSelectSession}
                onClose={onCloseSession}
                onRename={onRenameSession}
                onTogglePin={onTogglePin}
              />
            ) : null}
            {view === 'grouped' ? (
              timeList.map((session) => (
                <SessionRow
                  key={session.id}
                  session={session}
                  age={ages[session.id] ?? ''}
                  active={session.id === activeSessionId}
                  onSelect={onSelectSession}
                  onClose={onCloseSession}
                  onRename={onRenameSession}
                  onTogglePin={onTogglePin}
                />
              ))
            ) : projectGroups.length > 0 ? (
              <>
                <div className="px-2 pt-1 pb-[2px] text-[11.5px] leading-none text-muted-foreground">
                  {copy.sidebar.viewProjects}
                </div>
                {projectGroups.map((group) => (
                  <ProjectSection
                    key={group.key}
                    group={group}
                    collapsed={collapsedGroups.has(group.key)}
                    ages={ages}
                    activeSessionId={activeSessionId}
                    onToggleCollapse={onToggleGroupCollapse}
                    onExpand={onExpandGroup}
                    onSelect={onSelectSession}
                    onClose={onCloseSession}
                    onRename={onRenameSession}
                    onTogglePin={onTogglePin}
                  />
                ))}
              </>
            ) : null}
          </div>
        )}
      </div>
      <SidebarFooter actions={footerActions} refresh={refreshAction} />
    </aside>
  );
}

const SidebarMemo = React.memo(Sidebar);
export { SidebarMemo as Sidebar };
export type { SidebarProps };
