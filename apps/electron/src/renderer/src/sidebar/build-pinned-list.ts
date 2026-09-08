import type { SessionCardModel } from '@/sidebar/session-card-model';

/**
 * 已置顶区列表：sessionPath ∈ 置顶集合的会话，按最近活跃倒序。
 * 未落盘（sessionPath 为 null）的会话没有置顶键，不进入置顶区。
 */
export function buildPinnedList(
  sessions: readonly SessionCardModel[],
  pinnedPaths: ReadonlySet<string>,
): readonly SessionCardModel[] {
  return sessions
    .filter((session) => session.sessionPath !== null && pinnedPaths.has(session.sessionPath))
    .sort((a, b) => b.lastActivityAt - a.lastActivityAt);
}
