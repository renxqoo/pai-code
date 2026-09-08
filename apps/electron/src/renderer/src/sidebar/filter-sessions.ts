import type { SessionCardModel } from '@/sidebar/session-card-model';

/**
 * 侧栏会话过滤：空查询原样返回（同引用，不重建列表）；
 * 非空查询按标题/项目名做大小写不敏感子串匹配。
 * 标题由 hub 自动命名（首条消息前缀），间接覆盖消息内容前缀过滤。
 */
export function filterSessions(
  sessions: readonly SessionCardModel[],
  query: string,
): readonly SessionCardModel[] {
  const needle = query.trim().toLowerCase();
  if (needle.length === 0) return sessions;
  return sessions.filter(
    (session) =>
      session.title.toLowerCase().includes(needle) ||
      session.projectName.toLowerCase().includes(needle),
  );
}
