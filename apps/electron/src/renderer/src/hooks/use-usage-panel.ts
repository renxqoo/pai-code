import * as React from 'react';

import type { SessionCardModel } from '@/sidebar/session-card-model';
import { buildUsageEntries } from '@/screens/usage-entries';
import type { SessionStatsView } from '@paiapp/contracts';

type RefreshAllStats = () => void;

/**
 * 用量总览页装配（I2）：开合、进入时补拉全部线程统计、条目构建
 * （条目形状单一真相在 screens/usage-entries）。
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
  const [usageOpen, setUsageOpen] = React.useState(false);
  React.useEffect(() => {
    if (usageOpen) refreshAllStats();
    // eslint 不在此项目；refreshAllStats 引用不稳，依赖 usageOpen 单轴即可
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usageOpen]);
  const entries = React.useMemo(() => buildUsageEntries(sessions, statsById), [sessions, statsById]);
  const openUsage = React.useCallback(() => setUsageOpen(true), []);
  const closeUsage = React.useCallback(() => setUsageOpen(false), []);
  return { usageOpen, openUsage, closeUsage, entries };
}
