import type { SessionCardModel } from '@/sidebar/session-card-model';

/**
 * 分组视图平铺列表：排除置顶会话后按最近活跃倒序（置顶项只出现在置顶区）。
 * 输入顺序不构成前提，排序在本函数内完成。
 */
export function buildTimeList(
  sessions: readonly SessionCardModel[],
  pinnedPaths: ReadonlySet<string>,
): readonly SessionCardModel[] {
  return sessions
    .filter((session) => session.sessionPath === null || !pinnedPaths.has(session.sessionPath))
    .sort((a, b) => b.lastActivityAt - a.lastActivityAt);
}
