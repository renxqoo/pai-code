import * as React from 'react';
import { useStore } from 'zustand';

import { copy } from '@/strings';
import { baseNameOf } from '@/lib/project-dirs';
import { projectMenuItems, sessionMenuItems } from '@/thread/header-menus';
import { threadStatus } from '@/thread/thread-status';
import type { ThreadHeaderProps } from '@/thread/thread-header';
import { store as liveStore, workspaceActions } from '@/live/workspace-runtime';
import { uiStore } from '@/ui/ui-store';

type ThreadHeaderAssemblyInput = {
  /** 活跃线程 id（空 = 无会话；重命名/会话动作的寻址）。 */
  activeThreadId: string
  /** 活跃会话目录（空 = 无会话；项目名展示与目录动作的数据面）。 */
  cwd: string
  sessionTitle: string
  generating: boolean
  compacting: boolean
  queueCount: number
};

/**
 * 头部装配 hook（ThreadStage 的拆分件）：ThreadHeader 全 props（除 onStatusJump——
 * 回底动作属舞台贴底 hook）的视图模型与动作。自订阅面只含头部食物（对话框/侧栏
 * 几何/面板开合），运行在舞台组件体内——订阅 selector 与重渲半径和装配前逐点一致。
 */
export function useThreadHeaderAssembly(input: ThreadHeaderAssemblyInput): Omit<ThreadHeaderProps, 'onStatusJump'> {
  const { activeThreadId, cwd, sessionTitle, generating, compacting, queueCount } = input;
  const dialogs = useStore(liveStore, (s) => s.dialogs);
  /** 侧栏收起时左侧避让固定标题块（--titlebar-left-w 由标题覆盖块发布） */
  const sidebarCollapsed = useStore(uiStore, (s) => s.sidebarCollapsed);
  /** 右侧面板是否有打开的 tab（开关按钮的展开态）。 */
  const panelOpen = useStore(uiStore, (s) => s.panel.tabs.length > 0);

  /** 浏览器直开（无 preload）时桥不存在，降级为无动作 */
  const toggleMaximize = React.useCallback(() => {
    void window.pai?.window.toggleMaximize();
  }, []);

  const status = threadStatus({
    permissionWaiting: dialogs.some((dialog) => dialog.threadId === activeThreadId),
    compacting,
    generating,
    queueCount,
  });

  const projectMenu = React.useMemo(
    () => projectMenuItems({ openMenu: copy.thread.openMenu, copyPath: copy.thread.copyPath }),
    [],
  );
  /** ThreadHeader 是 memo 边界：labels 对象 memo 化（statusLabel 随状态变，其余为模块常量）。 */
  const headerLabels = React.useMemo(
    () => ({
      toggleMaximize: copy.thread.toggleMaximize,
      toggleSplitView: copy.thread.toggleSplitView,
      statusAria: copy.thread.statusAria,
      renameTitleAria: copy.thread.renameTitleAria,
      projectMenuAria: copy.thread.projectMenuAria,
      sessionMenuAria: copy.thread.sessionMenuAria,
      statusLabel: copy.thread.status[status],
    }),
    [status],
  );
  const sessionMenu = React.useMemo(
    () =>
      sessionMenuItems(
        {
          rename: copy.thread.sessionRename,
          copyId: copy.thread.sessionCopyId,
          reloadTrusted: copy.thread.reloadTrusted,
          reloadUntrusted: copy.thread.reloadUntrusted,
          archive: copy.thread.sessionArchive,
          close: copy.thread.sessionClose,
        },
        generating,
      ),
    [generating],
  );
  const onProjectAction = React.useCallback(
    (id: string) => {
      if (id === 'copyPath') {
        void workspaceActions.copyText(cwd);
        return;
      }
      if (id === 'finder' || id === 'terminal' || id === 'editor') void workspaceActions.openInSystem(cwd, id);
    },
    [cwd],
  );
  const onRenameTitle = React.useCallback(
    (name: string) => {
      void workspaceActions.renameSession(activeThreadId, name);
    },
    [activeThreadId],
  );
  const onSessionAction = React.useCallback(
    (id: string) => {
      if (id === 'copyId') void workspaceActions.copyText(activeThreadId);
      else if (id === 'reloadTrusted') workspaceActions.reloadSessionTrusted(activeThreadId, true);
      else if (id === 'reloadUntrusted') workspaceActions.reloadSessionTrusted(activeThreadId, false);
      else if (id === 'archive') workspaceActions.archiveSession(activeThreadId);
      else if (id === 'close') workspaceActions.closeSession(activeThreadId);
    },
    [activeThreadId],
  );
  /** ui 动作直调包装：引用恒定——ThreadHeader 是 memo 边界，内联箭头会随舞台每次
   * 重渲击穿（流式批推期每 50ms 一次）。 */
  const onTogglePanel = React.useCallback(() => uiStore.getState().togglePanelFromHeader(), []);

  const projectName = cwd.length === 0 ? '' : (baseNameOf(cwd) || cwd);

  return {
    projectName,
    sessionTitle,
    sidebarCollapsed,
    status,
    panelOpen,
    labels: headerLabels,
    projectMenu,
    sessionMenu,
    onProjectAction,
    onRenameTitle,
    onTogglePanel,
    onSessionAction,
    onToggleMaximize: toggleMaximize,
  };
}
