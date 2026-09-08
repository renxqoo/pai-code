import * as React from 'react';

import { copy } from '@/strings';
import { formatSidebarAge } from '@/sidebar/format-sidebar-age';
import type { SessionCardModel } from '@/sidebar/session-card-model';

/** 会话 id → 相对时间标签表。 */
export type SessionAges = Readonly<Record<string, string>>;

/**
 * 侧栏相对时间标签：分钟级粒度的独立低频 tick（静止会话不随流式 tick 重渲）。
 * copy 按属性访问解析 locale，标签函数在 memo 内取当前语言。
 */
export function useSessionAges(sessions: readonly SessionCardModel[], nowTickMs: number = 30_000): SessionAges {
  const [ageNow, setAgeNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    const handle = window.setInterval(() => setAgeNow(Date.now()), nowTickMs);
    return () => window.clearInterval(handle);
  }, [nowTickMs]);
  return React.useMemo(() => {
    const labels = copy.sidebar.age;
    const table: Record<string, string> = {};
    for (const session of sessions) {
      table[session.id] = formatSidebarAge(ageNow, session.lastActivityAt, labels);
    }
    return table;
  }, [sessions, ageNow]);
}
