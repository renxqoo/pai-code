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
import { useCurrentAnchorIndex } from '@/thread/use-current-anchor-index';
import { useElapsedNow } from '@/thread/use-elapsed-now';
import { useFollowLatest } from '@/thread/use-follow-latest';
import { useStickToBottom } from '@/thread/use-stick-to-bottom';
import { editUserMessage, forkUserMessage } from '@/screens/workspace-fork';
import { initialThreadState } from '@/live/live-thread-state';
import { store as liveStore, workspaceActions } from '@/live/workspace-runtime';
import { threadModelOf } from '@/live/store';
import { uiStore } from '@/ui/ui-store';

/**
 * 会话舞台（T34 M2 区域化，0 props + memo）：live/ui store 自订阅——全宽菜单栏 +
 * 掉线横幅 + 页面滚动消息流 + 轮次锚点带 + 回底浮标。流式增量的重渲半径收敛在
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
  const cwd = activeSession?.cwd ?? '';

  const header = useThreadHeaderAssembly({
    activeThreadId,
    cwd,
    sessionTitle: activeSession?.title ?? '',
    generating,
  });

  /** 页面滚动：菜单栏固定，消息流独占滚动容器，贴底跟随挂在容器上；
   *  发送回底信号消费即回到底部并恢复跟随（用户主动发送的显式意图）。 */
  const { containerRef: scrollRef, onScroll, atBottom, scrollToBottom } = useStickToBottom();
  useFollowLatest(scrollToBottom);
  const turnAnchorList = React.useMemo(() => turnAnchors(activeThread.items), [activeThread.items]);
  const anchorIds = React.useMemo(() => turnAnchorList.map((anchor) => anchor.id), [turnAnchorList]);
  /** 当前阅读轮（T55 窗口中心）：随滚动在锚点集上滑动，锚点带只展示 ±10 邻域 */
  const { index: currentAnchorIndex, pinTurn } = useCurrentAnchorIndex(scrollRef, anchorIds);
  const jumpToTurn = React.useCallback((turnId: string) => {
    const container = scrollRef.current;
    if (container === null) return;
    const section = container.querySelector(`[data-turn-id="${CSS.escape(turnId)}"]`);
    if (section === null) return;
    // 先钉住窗口再起滚：平滑滚动是多帧飞行，逐帧推进窗口会让刻痕逐个换位（闪/抖），
    // 瞄准与点击之间刻痕换身份更会跳错消息；落定后自动恢复跟随
    pinTurn(turnId);
    // 尊重系统减弱动态偏好：平滑滚动降级为直接定位
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    section.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start', inline: 'nearest' });
  }, [pinTurn]);
  /** ui 动作直调包装：引用恒定——MessageList/HostDownBanner 是 memo 边界，内联箭头
   * 会随舞台每次重渲击穿（流式增量期逐事件重渲）。 */
  const onOpenSettings = React.useCallback(() => uiStore.getState().openSettings(), []);
  const onOpenDiff = React.useCallback(() => uiStore.getState().openDiffPane(), []);

  return (
    <>
      {/* 固定头区：菜单栏全宽不随页面滚动（拖拽区连续无侧栏间隙断档），掉线横幅保持内容列节奏 */}
      <ThreadHeader {...header} />
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
          emptyTitle={
            activeSession === undefined
              ? copy.thread.noSessionTitle
              : thread.hydrateFailed
                ? copy.flow.hydrateFailedTitle
                : copy.thread.emptyTitle
          }
          emptyHint={
            activeSession === undefined
              ? copy.thread.noSessionHint
              : thread.hydrateFailed
                ? copy.flow.hydrateFailedHint
                : copy.thread.emptyHint
          }
          onRetryHydrate={thread.hydrateFailed ? workspaceActions.retryHydration : undefined}
          retryLabel={copy.thread.retryHydration}
          onOpenDiff={onOpenDiff}
          onEditUserMessage={editUserMessage}
          onForkUserMessage={forkUserMessage}
        />
      </div>
      <TurnAnchorRail anchors={turnAnchorList} currentIndex={currentAnchorIndex} onJump={jumpToTurn} />
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
