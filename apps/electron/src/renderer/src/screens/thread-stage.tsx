import * as React from 'react';
import { useStore } from 'zustand';

import { copy } from '@/strings';
import { baseNameOf } from '@/lib/project-dirs';
import { HostDownBanner } from '@/screens/host-down-banner';
import { MessageList } from '@/thread/message-list';
import { ScrollToBottomButton } from '@/thread/scroll-to-bottom-button';
import { ThreadHeader } from '@/thread/thread-header';
import { projectMenuItems, sessionMenuItems, viewMenuItems } from '@/thread/header-menus';
import { threadStatus } from '@/thread/thread-status';
import { TurnAnchorRail } from '@/thread/turn-anchor-rail';
import { turnAnchors } from '@/thread/turn-anchor-data';
import { useElapsedNow } from '@/thread/use-elapsed-now';
import { useStickToBottom } from '@/thread/use-stick-to-bottom';
import { editUserMessage, forkUserMessage } from '@/screens/workspace-fork';
import { openFilePicker } from '@/panel/panel-controller';
import { initialThreadState } from '@/live/live-thread-state';
import { store as liveStore, workspaceActions } from '@/live/workspace-runtime';
import { threadModelOf } from '@/live/store';
import { uiStore } from '@/ui/ui-store';

/**
 * 会话舞台（T34 M2 区域化，0 props + memo）：live/ui store 自订阅——全宽菜单栏 +
 * 掉线横幅 + 页面滚动消息流 + 轮次锚点带 + 回底浮标。流式批推的重渲半径收敛在
 * 本区域（B-batch 用例钉住）。菜单栏不随滚动，贴底跟随挂滚动容器。
 */
function ThreadStage(): React.JSX.Element {
  const activeThreadId = useStore(liveStore, (s) => s.activeThreadId) ?? '';
  const activeSession = useStore(liveStore, (s) => (s.activeThreadId === null ? undefined : s.sessions[s.activeThreadId]));
  /** threadModelOf 经 WeakMap 缓存（无关 set 不换引用，MessageList memo 天然稳） */
  const activeThread = useStore(liveStore, (s) => threadModelOf(s, s.activeThreadId ?? ''));
  const rawThread = useStore(liveStore, (s) => (s.activeThreadId === null ? undefined : s.threads[s.activeThreadId]));
  const dialogs = useStore(liveStore, (s) => s.dialogs);
  const hostDown = useStore(liveStore, (s) => s.hostPhase === null || s.hostPhase === 'failed');
  const sidebarCollapsed = useStore(uiStore, (s) => s.sidebarCollapsed);
  const bottomInset = useStore(uiStore, (s) => s.composerInset);
  const panelOpen = useStore(uiStore, (s) => s.panel.tabs.length > 0);

  const thread = rawThread ?? initialThreadState;
  const generating = thread.streaming;
  const executing = generating || thread.bashRunning || thread.compacting;
  /** 运行计时只随执行态走表（子代理计时在 AgentPanel 各自门控） */
  const now = useElapsedNow(executing);
  const queueCount = thread.queue.steering.length + thread.queue.followUp.length;

  /** 页面滚动：菜单栏固定，消息流独占滚动容器，贴底跟随挂在容器上 */
  const { containerRef: scrollRef, onScroll, atBottom, scrollToBottom } = useStickToBottom();
  const turnAnchorList = React.useMemo(() => turnAnchors(activeThread.items), [activeThread.items]);
  const jumpToTurn = React.useCallback((turnId: string) => {
    const container = scrollRef.current;
    if (container === null) return;
    const section = container.querySelector(`[data-turn-id="${CSS.escape(turnId)}"]`);
    if (section === null) return;
    // 尊重系统减弱动态偏好：平滑滚动降级为直接定位
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    section.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start', inline: 'nearest' });
  }, []);
  /** 浏览器直开（无 preload）时桥不存在，降级为无动作 */
  const toggleMaximize = React.useCallback(() => {
    void window.pai?.window.toggleMaximize();
  }, []);

  const status = threadStatus({
    permissionWaiting: dialogs.some((dialog) => dialog.threadId === activeThreadId),
    compacting: thread.compacting,
    generating,
    queueCount,
  });
  const cwd = activeSession?.cwd ?? '';
  const projectMenu = React.useMemo(
    () => projectMenuItems({ openMenu: copy.thread.openMenu, copyPath: copy.thread.copyPath }),
    [],
  );
  /** ThreadHeader 是 memo 边界：labels 对象 memo 化（statusLabel 随状态变，其余为模块常量）。 */
  const headerLabels = React.useMemo(
    () => ({
      toggleMaximize: copy.thread.toggleMaximize,
      viewMenuAria: copy.thread.viewMenuAria,
      toggleSplitView: copy.thread.toggleSplitView,
      statusAria: copy.thread.statusAria,
      renameTitleAria: copy.thread.renameTitleAria,
      projectMenuAria: copy.thread.projectMenuAria,
      sessionMenuAria: copy.thread.sessionMenuAria,
      statusLabel: copy.thread.status[status],
    }),
    [status],
  );
  const viewMenu = React.useMemo(
    () => viewMenuItems({ openFile: copy.panel.file.openPickerTitle, diff: copy.panel.tabDiff, agents: copy.panel.tabAgents }),
    [],
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
  /** 「+视图」菜单：打开并聚焦对应面板 tab（toggle 语义只保留给快捷键）。 */
  const onViewAction = React.useCallback((id: string) => {
    const ui = uiStore.getState();
    if (id === 'diff') ui.openDiffPane();
    else if (id === 'agents') ui.openAgentsPane();
    else if (id === 'openFile') openFilePicker();
  }, []);

  return (
    <>
      {/* 固定头区：菜单栏全宽不随页面滚动（拖拽区连续无侧栏间隙断档），掉线横幅保持内容列节奏 */}
      <ThreadHeader
        projectName={activeSession ? (baseNameOf(activeSession.cwd) || activeSession.cwd) : ''}
        sessionTitle={activeSession?.title ?? ''}
        sidebarCollapsed={sidebarCollapsed}
        status={status}
        panelOpen={panelOpen}
        labels={headerLabels}
        projectMenu={projectMenu}
        sessionMenu={sessionMenu}
        viewMenu={viewMenu}
        onProjectAction={onProjectAction}
        onViewAction={onViewAction}
        onRenameTitle={onRenameTitle}
        onStatusJump={scrollToBottom}
        onTogglePanel={() => uiStore.getState().togglePanelFromHeader()}
        onSessionAction={onSessionAction}
        onToggleMaximize={toggleMaximize}
      />
      {hostDown ? (
        <div className="shrink-0 px-[40px]">
          <HostDownBanner onOpenSettings={() => uiStore.getState().openSettings()} />
        </div>
      ) : null}
      <div ref={scrollRef} onScroll={onScroll} className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto overflow-x-hidden  px-[40px]">
        <MessageList
          thread={activeThread}
          now={now}
          loading={executing}
          bottomInset={bottomInset}
          emptyTitle={thread.hydrateFailed ? copy.flow.hydrateFailedTitle : copy.thread.emptyTitle}
          emptyHint={thread.hydrateFailed ? copy.flow.hydrateFailedHint : copy.thread.emptyHint}
          onRetryHydrate={thread.hydrateFailed ? workspaceActions.retryHydration : undefined}
          retryLabel={copy.thread.retryHydration}
          onOpenDiff={() => uiStore.getState().openDiffPane()}
          onEditUserMessage={editUserMessage}
          onForkUserMessage={forkUserMessage}
        />
      </div>
      <TurnAnchorRail anchors={turnAnchorList} onJump={jumpToTurn} />
      {atBottom ? null : (
        <div className="animate-in fade-in duration-150">
          <ScrollToBottomButton onClick={scrollToBottom} style={{ bottom: bottomInset + 14, right: 68 }} />
        </div>
      )}
    </>
  );
}

const ThreadStageMemo = React.memo(ThreadStage);
export { ThreadStageMemo as ThreadStage };
