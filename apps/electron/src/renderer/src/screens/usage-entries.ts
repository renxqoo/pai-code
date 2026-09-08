import type { SessionStatsView } from '@paiapp/contracts';

import type { SessionCardModel } from '@/sidebar/session-card-model';

/** Usage 总览行装配：会话卡 × 用量快照 → 展示行（无快照按 0 呈现）。 */
export function buildUsageEntries(
  sessions: readonly SessionCardModel[],
  statsById: Readonly<Record<string, SessionStatsView>>,
): Array<{ title: string; projectName: string; model: string; tokensTotal: number; cost: number; messageCount: number }> {
  return sessions.map((session) => {
    const stats = statsById[session.id];
    return {
      title: session.title,
      projectName: session.projectName,
      model: session.version,
      tokensTotal: stats?.tokensTotal ?? 0,
      cost: stats?.cost ?? 0,
      messageCount: (stats?.userMessages ?? 0) + (stats?.assistantMessages ?? 0),
    };
  });
}
