import type { SessionCardModel } from '@/sidebar/session-card-model';

/**
 * 已归档会话过滤（sessionPath 键，偏好 archivedSessions）：侧栏三列表共用；
 * 空集合时同引用返回（零重建）。设置页历史分区按同一集合切「已归档」分组。
 */
export function excludeArchivedSessions(
  sessions: readonly SessionCardModel[],
  archivedPaths: ReadonlySet<string>,
): readonly SessionCardModel[] {
  if (archivedPaths.size === 0) return sessions;
  // sessionPath 为 null（会话尚未落文件）不可能被归档标记，保持可见
  return sessions.filter((session) => session.sessionPath === null || !archivedPaths.has(session.sessionPath));
}
