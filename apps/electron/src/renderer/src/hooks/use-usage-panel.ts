import * as React from 'react';
import { useStore } from 'zustand';

import type { SessionCardModel } from '@/sidebar/session-card-model';
import { buildUsageEntries } from '@/screens/usage-entries';
import { uiStore } from '@/ui/ui-store';
import type { SessionStatsView } from '@paiapp/contracts';

type RefreshAllStats = () => void;

/**
 * 用量总览页装配（I2）：开合态在 ui store（usageOpen）、进入时补拉全部线程统计、
 * 条目构建（条目形状单一真相在 screens/usage-entries）。
 * 补拉是 IO，居留本 hook 的订阅点 effect——ui store 动作保持零 IO。
 */
export function useUsagePanel(
  sessions: readonly SessionCardModel[],
  statsById: Readonly<Record<string, SessionStatsView>>,
  refreshAllStats: RefreshAllStats,
): {
  usageOpen: boolean;
  openUsage: () => void;
  closeUsage: () => void;
  entries: ReturnType<typeof buildUsageEntries>;
} {
  const usageOpen = useStore(uiStore, (s) => s.usageOpen);
  const openUsage = React.useCallback(() => uiStore.getState().openUsage(), []);
  const closeUsage = React.useCallback(() => uiStore.getState().closeUsage(), []);
  React.useEffect(() => {
    if (usageOpen) refreshAllStats();
    // refreshAllStats 引用不稳，依赖 usageOpen 单轴即可
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usageOpen]);
  const entries = React.useMemo(() => buildUsageEntries(sessions, statsById), [sessions, statsById]);
  return { usageOpen, openUsage, closeUsage, entries };
}
