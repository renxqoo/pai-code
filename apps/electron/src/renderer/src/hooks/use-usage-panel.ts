import * as React from 'react';
import { useStore } from 'zustand';

import { sessionCardsOf } from '@/sidebar/session-cards';
import { buildUsageEntries } from '@/screens/usage-entries';
import { store as liveStore, workspaceActions } from '@/live/workspace-runtime';
import { uiStore } from '@/ui/ui-store';

/**
 * 用量总览页装配（I2 / T34 M3 下沉为 0 入参自订阅）：开合在 ui store；
 * 条目与开页补拉全部由 UsageScreen 挂载面自取（open 门控——冷路径不进工作区订阅面）。
 * 补拉是 IO，居留订阅点 effect——ui store 动作保持零 IO。
 */
export function useUsagePanel(): {
  usageOpen: boolean;
  openUsage: () => void;
  closeUsage: () => void;
} {
  const usageOpen = useStore(uiStore, (s) => s.usageOpen);
  const openUsage = React.useCallback(() => uiStore.getState().openUsage(), []);
  const closeUsage = React.useCallback(() => uiStore.getState().closeUsage(), []);
  return { usageOpen, openUsage, closeUsage };
}

/** UsageScreen 挂载面：条目构建（自订阅 sessions/stats）+ 开页补拉（effect 居留）。 */
export function useUsageEntries(open: boolean): ReturnType<typeof buildUsageEntries> {
  const sessionViews = useStore(liveStore, (s) => s.sessions);
  const statsById = useStore(liveStore, (s) => s.stats);
  React.useEffect(() => {
    if (open) workspaceActions.refreshAllStats();
    // refreshAllStats 引用恒定（actions 单例）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  return React.useMemo(() => buildUsageEntries(sessionCardsOf(sessionViews), statsById), [sessionViews, statsById]);
}
