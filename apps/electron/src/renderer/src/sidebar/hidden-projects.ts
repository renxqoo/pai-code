import type { SessionCardModel } from '@/sidebar/session-card-model';

/**
 * 已移除（隐藏）项目过滤：排除 cwd 命中隐藏集合的会话。
 * 置顶/分组/项目组三列表共用同一过滤（移除项目 = 该项目全部会话不显示）。
 * 空集合时同引用返回（零重建）。
 */
export function excludeHiddenProjects(
  sessions: readonly SessionCardModel[],
  hiddenProjects: ReadonlySet<string>,
): readonly SessionCardModel[] {
  if (hiddenProjects.size === 0) return sessions;
  return sessions.filter((session) => !hiddenProjects.has(session.cwd));
}
