import * as React from 'react';
import { useStore } from 'zustand';

import { store as liveStore } from '@/live/workspace-runtime';
import { uiStore } from '@/ui/ui-store';

/**
 * 发送回底：消费 uiStore 的一次性信号（用户主动投递成功时递增、threadId 寻址）。
 * 命中当前活跃线程即调 scrollToBottom（回到底部 + 恢复贴底跟随）；每个信号只
 * 消费一次——重渲/切线程不重放；同批多次信号合并为一次回底（意图幂等，
 * 回底不需要按次反应）。非本线程的发送（子代理 steer、他线程排队）不拉走
 * 阅读位置。挂载时现存信号视为历史（种子式消费，与图片回填信号同口径）。
 */
export function useFollowLatest(scrollToBottom: () => void): void {
  const followLatest = useStore(uiStore, (state) => state.followLatest);
  const activeThreadId = useStore(liveStore, (state) => state.activeThreadId);
  const consumedTokenRef = React.useRef(followLatest === null ? 0 : followLatest.token);
  React.useEffect(() => {
    if (followLatest === null) return;
    if (followLatest.threadId !== activeThreadId) return;
    if (consumedTokenRef.current === followLatest.token) return;
    consumedTokenRef.current = followLatest.token;
    scrollToBottom();
  }, [followLatest, activeThreadId, scrollToBottom]);
}
