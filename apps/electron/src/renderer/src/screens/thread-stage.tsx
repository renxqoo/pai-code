import * as React from 'react';
import { useStore } from 'zustand';

import { copy } from '@/strings';
import { HostDownBanner } from '@/screens/host-down-banner';
import { MessageList } from '@/thread/message-list';
import { ScrollToBottomButton } from '@/thread/scroll-to-bottom-button';
import { ThreadHeader } from '@/thread/thread-header';
import { useThreadHeaderAssembly } from '@/thread/use-thread-header-assembly';
import { TurnAnchorRail } from '@/thread/turn-anchor-rail';
import { turnAnchors } from '@/thread/turn-anchor-data';
import { useElapsedNow } from '@/thread/use-elapsed-now';
import { useStickToBottom } from '@/thread/use-stick-to-bottom';
import { editUserMessage, forkUserMessage } from '@/screens/workspace-fork';
import { initialThreadState } from '@/live/live-thread-state';
import { store as liveStore, workspaceActions } from '@/live/workspace-runtime';
import { threadModelOf } from '@/live/store';
import { uiStore } from '@/ui/ui-store';

/**
 * 会话舞台（T34 M2 区域化，0 props + memo）：live/ui store 自订阅——全宽菜单栏 +
 * 掉线横幅 + 页面滚动消息流 + 轮次锚点带 + 回底浮标。流式批推的重渲半径收敛在
 * 本区域（B-batch 用例钉住）。菜单栏不随滚动，贴底跟随挂滚动容器。
 * 头部的视图模型与动作装配在 use-thread-header-assembly（与 ThreadHeader 同目录）。
 */
function ThreadStage(): React.JSX.Element {
  const activeThreadId = useStore(liveStore, (s) => s.activeThreadId) ?? '';
  const activeSession = useStore(liveStore, (s) => (s.activeThreadId === null ? undefined : s.sessions[s.activeThreadId]));
  /** threadModelOf 经 WeakMap 缓存（无关 set 不换引用，MessageList memo 天然稳） */
  const activeThread = useStore(liveStore, (s) => threadModelOf(s, s.activeThreadId ?? ''));
  const rawThread = useStore(liveStore, (s) => (s.activeThreadId === null ? undefined : s.threads[s.activeThreadId]));
  const hostDown = useStore(liveStore, (s) => s.hostPhase === null || s.hostPhase === 'failed');
  const bottomInset = useStore(uiStore, (s) => s.composerInset);

  const thread = rawThread ?? initialThreadState;
  const generating = thread.streaming;
  const executing = generating || thread.bashRunning || thread.compacting;
  /** 运行计时只随执行态走表（子代理计时在 AgentPanel 各自门控） */
  const now = useElapsedNow(executing);
  const queueCount = thread.queue.steering.length + thread.queue.followUp.length;
  const cwd = activeSession?.cwd ?? '';

  const header = useThreadHeaderAssembly({
    activeThreadId,
    cwd,
    sessionTitle: activeSession?.title ?? '',
    generating,
    compacting: thread.compacting,
    queueCount,
  });

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
  /** ui 动作直调包装：引用恒定——MessageList/HostDownBanner 是 memo 边界，内联箭头
   * 会随舞台每次重渲击穿（流式批推期每 50ms 一次）。 */
  const onOpenSettings = React.useCallback(() => uiStore.getState().openSettings(), []);
  const onOpenDiff = React.useCallback(() => uiStore.getState().openDiffPane(), []);

  return (
    <>
      {/* 固定头区：菜单栏全宽不随页面滚动（拖拽区连续无侧栏间隙断档），掉线横幅保持内容列节奏 */}
      <ThreadHeader {...header} onStatusJump={scrollToBottom} />
      {hostDown ? (
        <div className="shrink-0 px-[40px]">
          <HostDownBanner onOpenSettings={onOpenSettings} />
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
          onOpenDiff={onOpenDiff}
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
