import * as React from 'react';

import { copy } from '@/strings';
import { HostDownBanner } from '@/screens/host-down-banner';
import { MessageList } from '@/thread/message-list';
import { ScrollToBottomButton } from '@/thread/scroll-to-bottom-button';
import { ThreadHeader } from '@/thread/thread-header';
import { TurnAnchorRail } from '@/thread/turn-anchor-rail';
import { turnAnchors } from '@/thread/turn-anchor-data';
import { useStickToBottom } from '@/thread/use-stick-to-bottom';
import type { SidePanel } from '@/screens/esc-action';
import type { LiveWorkspaceView } from '@/live/use-live-workspace';

type ThreadStageProps = {
  workspace: LiveWorkspaceView
  activeThreadId: string
  sidebarCollapsed: boolean
  panel: SidePanel
  onToggleSplitView: () => void
  /** 宿主掉线（从未构建或 failed）：置顶横幅与输入区模型位共用同一真相。 */
  hostDown: boolean
  /** 底部输入浮层的避让高度：内容列底部 padding 与回底浮标定位共用。 */
  bottomInset: number
  onOpenSettings: () => void
  onOpenAgents: () => void
  onOpenDiff: () => void
  onEditUserMessage: (text: string) => void
  onForkUserMessage?: (entryId: string, text: string, autoResend: boolean) => void
}

/** 尚未接线/不适用当前会话的动作统一落到空实现，接线点保持稳定。 */
function noop(): void {}

/**
 * 会话舞台（主区固定结构，以 fragment 挂进主区根）：全宽菜单栏 + 掉线横幅 +
 * 页面滚动消息流；菜单栏不随滚动，贴底跟随、轮次锚点带、回底浮标挂本层。
 */
function ThreadStage({ workspace, activeThreadId, sidebarCollapsed, panel, onToggleSplitView, hostDown, bottomInset, onOpenSettings, onOpenAgents, onOpenDiff, onEditUserMessage, onForkUserMessage }: ThreadStageProps) {
  const { sessions } = workspace;
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
  const onOpenMenuSelect = React.useCallback(
    (label: string) => {
      // 受信重开：stop → 同文件 resume(trusted)；其余装饰项维持原空操作
      if (label === copy.thread.reloadTrusted) {
        workspace.actions.reloadSessionTrusted(activeThreadId, true);
      } else if (label === copy.thread.reloadUntrusted) {
        workspace.actions.reloadSessionTrusted(activeThreadId, false);
      }
    },
    [workspace.actions, activeThreadId],
  );

  return (
    <>
      {/* 固定头区：菜单栏全宽不随页面滚动（拖拽区连续无侧栏间隙断档），掉线横幅保持内容列节奏 */}
      <ThreadHeader
        projectName={sessions.find((session) => session.id === activeThreadId)?.projectName ?? ''}
        sessionTitle={sessions.find((session) => session.id === activeThreadId)?.title ?? ''}
        sidebarCollapsed={sidebarCollapsed}
        labels={{
          addAction: copy.thread.addAction,
          open: copy.thread.open,
          commitPushPr: copy.thread.commitPushPr,
          toggleSplitView: copy.thread.toggleSplitView,
          toggleMaximize: copy.thread.toggleMaximize,
        }}
        tabs={{
          addLabel: copy.thread.tabAdd,
          onAdd: noop,
        }}
        activePanel={panel}
        openMenu={[...(workspace.generating ? [] : [copy.thread.reloadTrusted, copy.thread.reloadUntrusted]), ...copy.thread.openMenu]}
        commitMenu={copy.thread.commitMenu}
        onAddAction={noop}
        onOpen={noop}
        onCommit={noop}
        onOpenMenuSelect={onOpenMenuSelect}
        onCommitMenuSelect={noop}
        onToggleSplitView={onToggleSplitView}
        onToggleMaximize={toggleMaximize}
      />
      {hostDown ? (
        <div className="shrink-0 px-[40px]">
          <HostDownBanner onOpenSettings={onOpenSettings} />
        </div>
      ) : null}
      <div ref={scrollRef} onScroll={onScroll} className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto overflow-x-hidden px-[40px]">
        <MessageList
          thread={workspace.activeThread}
          now={workspace.now}
          loading={workspace.executing}
          bottomInset={bottomInset}
          emptyTitle={copy.thread.emptyTitle}
          emptyHint={copy.thread.emptyHint}
          onOpenAgents={onOpenAgents}
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
