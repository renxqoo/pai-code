import * as React from 'react';
import { useStore } from 'zustand';

import { ProjectFilesPanel } from '@/project-files/project-files-panel';
import { QuickActionsRow } from '@/sidebar/quick-actions-row';
import { closeProjectFiles } from '@/sidebar/project-files';
import { SessionListRegion } from '@/sidebar/session-list-region';
import { SidebarFooter } from '@/sidebar/sidebar-footer';
import { SidebarSearch } from '@/sidebar/sidebar-search';
import { ViewSwitchTabs } from '@/sidebar/view-switch-tabs';
import { useSidebarResize } from '@/hooks/use-sidebar-resize';
import { SIDEBAR_MAX_WIDTH, SIDEBAR_MIN_WIDTH, uiStore } from '@/ui/ui-store';

import { cn } from '@/lib/utils';

/**
 * 会话侧栏（布局壳，0 props）：几何（宽度拖拽 + 折叠）、各功能区域（快捷操作/
 * 搜索/视图切换/列表/项目文件面板/底部工具条）全部区域内部自订阅解决——
 * 父级重渲被 memo 边界挡住，区域只随自己的订阅面重渲。标题行由窗口顶栏承担。
 */
function Sidebar(): React.JSX.Element {
  const collapsed = useStore(uiStore, (s) => s.sidebarCollapsed);
  const projectFiles = useStore(uiStore, (s) => s.projectFiles);
  const { width } = useSidebarResize(SIDEBAR_MIN_WIDTH, SIDEBAR_MAX_WIDTH);

  return (
    <aside
      style={{ width: collapsed ? 0 : width }}
      className={cn(
        'flex h-full min-h-0 shrink-0 flex-col overflow-hidden border-sidebar-border bg-sidebar transition-[width] duration-200 motion-reduce:transition-none',
        collapsed ? 'border-r-0' : 'border-r',
      )}
    >
      {/* 顶行由 fixed 标题覆盖块承担，这里只留等高占位 */}
      <div aria-hidden="true" className="h-[46px] shrink-0 " />
      {projectFiles.target !== null ? (
        /* 项目文件面板：整个内容区让位（快捷区/搜索/Tab/列表不渲染），底部工具条同图不渲染 */
        <div className="flex min-h-0 flex-1 flex-col pt-1 pb-2">
          <ProjectFilesPanel
            projectName={projectFiles.target.name}
            projectPath={projectFiles.target.path}
            tree={projectFiles.tree}
            loading={projectFiles.loading}
            onClose={closeProjectFiles}
          />
        </div>
      ) : (
        <>
          <div className="flex min-h-0 flex-1 flex-col pt-2 ">
            <div className="px-2 ">
              <QuickActionsRow />
              <SidebarSearch />
            </div>

            <div className="overflow-y-auto   overflow-x-hidden">
              <div className="px-2">
                <div className="pt-2.5">
                  <ViewSwitchTabs />
                </div>
                <SessionListRegion />
              </div>
            </div>
          </div>
          <SidebarFooter />
        </>
      )}
    </aside>
  );
}

const SidebarMemo = React.memo(Sidebar);
export { SidebarMemo as Sidebar };
