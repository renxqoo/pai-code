const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * 相对时间短标记：列表卡片右上角的 3d / 2h / 5m。
 * 未来时间与瞬时差按「刚刚以内」处理，输出 m 级标记。
 */
export function formatRelativeAge(now: number, then: number): string {
  const elapsed = Math.max(0, now - then);
  if (elapsed >= DAY) return `${Math.floor(elapsed / DAY)}d`;
  if (elapsed >= HOUR) return `${Math.floor(elapsed / HOUR)}h`;
  return `${Math.max(1, Math.floor(elapsed / MINUTE))}m`;
}
