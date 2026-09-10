import * as React from 'react';

import { copy } from '@/strings';
import { HostDownBanner } from '@/screens/host-down-banner';
import { MessageList } from '@/thread/message-list';
import { ScrollToBottomButton } from '@/thread/scroll-to-bottom-button';
import { ThreadHeader } from '@/thread/thread-header';
import { projectMenuItems, sessionMenuItems } from '@/thread/header-menus';
import { threadStatus } from '@/thread/thread-status';
import { TurnAnchorRail } from '@/thread/turn-anchor-rail';
import { turnAnchors } from '@/thread/turn-anchor-data';
import { useStickToBottom } from '@/thread/use-stick-to-bottom';
import type { LiveWorkspaceView } from '@/live/use-live-workspace';

type ThreadStageProps = {
  workspace: LiveWorkspaceView
  activeThreadId: string
  sidebarCollapsed: boolean
  /** 宿主掉线（从未构建或 failed）：置顶横幅与输入区模型位共用同一真相。 */
  hostDown: boolean
  /** 底部输入浮层的避让高度：内容列底部 padding 与回底浮标定位共用。 */
  bottomInset: number
  onOpenSettings: () => void
  onOpenDiff: () => void
  onNewTask: () => void
  onToggleSplitView: () => void
  onEditUserMessage: (text: string) => void
  onForkUserMessage?: (entryId: string, text: string, images: ReadonlyArray<{ data: string; mimeType: string }>, autoResend: boolean) => void
}

/**
 * 会话舞台（主区固定结构，以 fragment 挂进主区根）：全宽菜单栏 + 掉线横幅 +
 * 页面滚动消息流；菜单栏不随滚动，贴底跟随、轮次锚点带、回底浮标挂本层。
 */
function ThreadStage({ workspace, activeThreadId, sidebarCollapsed, hostDown, bottomInset, onOpenSettings, onOpenDiff, onNewTask, onToggleSplitView, onEditUserMessage, onForkUserMessage }: ThreadStageProps) {
  const { sessions, actions } = workspace;
  /** 页面滚动：菜单栏固定，消息流独占滚动容器，贴底跟随挂在容器上 */
  const { containerRef: scrollRef, onScroll, atBottom, scrollToBottom } = useStickToBottom();
  const turnAnchorList = React.useMemo(() => turnAnchors(workspace.activeThread.items), [workspace.activeThread.items]);
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

  const activeSession = sessions.find((session) => session.id === activeThreadId);
  const status = threadStatus({
    permissionWaiting: workspace.dialogs.some((dialog) => dialog.threadId === activeThreadId),
    compacting: workspace.compacting,
    generating: workspace.generating,
    queueCount: workspace.queueCount,
  });
  const projectMenu = React.useMemo(
    () => projectMenuItems({ openMenu: copy.thread.openMenu, copyPath: copy.thread.copyPath }),
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
          close: copy.thread.sessionClose,
        },
        workspace.generating,
      ),
    [workspace.generating],
  );
  const cwd = workspace.activeCwd;
  const onProjectAction = React.useCallback(
    (id: string) => {
      if (id === 'copyPath') {
        void actions.copyText(cwd);
        return;
      }
      if (id === 'finder' || id === 'terminal' || id === 'editor') void actions.openInSystem(cwd, id);
    },
    [actions, cwd],
  );
  const onRenameTitle = React.useCallback(
    (name: string) => {
      void actions.renameSession(activeThreadId, name);
    },
    [actions, activeThreadId],
  );
  const onSessionAction = React.useCallback(
    (id: string) => {
      if (id === 'copyId') void actions.copyText(activeThreadId);
      else if (id === 'reloadTrusted') actions.reloadSessionTrusted(activeThreadId, true);
      else if (id === 'reloadUntrusted') actions.reloadSessionTrusted(activeThreadId, false);
      else if (id === 'close') actions.closeSession(activeThreadId);
    },
    [actions, activeThreadId],
  );

  return (
    <>
      {/* 固定头区：菜单栏全宽不随页面滚动（拖拽区连续无侧栏间隙断档），掉线横幅保持内容列节奏 */}
      <ThreadHeader
        projectName={activeSession?.projectName ?? ''}
        sessionTitle={activeSession?.title ?? ''}
        sidebarCollapsed={sidebarCollapsed}
        status={status}
        additions={workspace.threadDiff.additions}
        deletions={workspace.threadDiff.deletions}
        labels={{
          newTask: copy.thread.newTask,
          toggleSplitView: copy.thread.toggleSplitView,
          toggleMaximize: copy.thread.toggleMaximize,
          changes: copy.thread.changes,
          statusAria: copy.thread.statusAria,
          renameTitleAria: copy.thread.renameTitleAria,
          projectMenuAria: copy.thread.projectMenuAria,
          sessionMenuAria: copy.thread.sessionMenuAria,
          statusLabel: copy.thread.status[status],
        }}
        projectMenu={projectMenu}
        sessionMenu={sessionMenu}
        onProjectAction={onProjectAction}
        onRenameTitle={onRenameTitle}
        onStatusJump={scrollToBottom}
        onOpenChanges={onOpenDiff}
        onSessionAction={onSessionAction}
        onNewTask={onNewTask}
        onToggleSplitView={onToggleSplitView}
        onToggleMaximize={toggleMaximize}
      />
      {hostDown ? (
        <div className="shrink-0 px-[40px]">
          <HostDownBanner onOpenSettings={onOpenSettings} />
        </div>
      ) : null}
      <div ref={scrollRef} onScroll={onScroll} className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto overflow-x-hidden  px-[40px]">
        <MessageList
          thread={workspace.activeThread}
          now={workspace.now}
          loading={workspace.executing}
          bottomInset={bottomInset}
          emptyTitle={workspace.hydrateFailed ? copy.flow.hydrateFailedTitle : copy.thread.emptyTitle}
          emptyHint={workspace.hydrateFailed ? copy.flow.hydrateFailedHint : copy.thread.emptyHint}
          onRetryHydrate={workspace.hydrateFailed ? workspace.actions.retryHydration : undefined}
          retryLabel={copy.thread.retryHydration}
          onOpenDiff={onOpenDiff}
          onEditUserMessage={onEditUserMessage}
          onForkUserMessage={onForkUserMessage}
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

export { ThreadStage };
