/** 侧栏相对时间标签文案（注入自 strings，保持 formatter 无 locale 依赖）。 */
export type SidebarAgeLabels = {
  justNow: string;
  minutes: (value: number) => string;
  hours: (value: number) => string;
  days: (value: number) => string;
};

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * 侧栏行内相对时间标签：刚刚 / N分钟 / N小时 / N天。
 * 未来时间与瞬时差按「刚刚」处理（与消息流相对年龄同一容错口径）。
 */
export function formatSidebarAge(now: number, then: number, labels: SidebarAgeLabels): string {
  const elapsed = Math.max(0, now - then);
  if (elapsed < MINUTE) return labels.justNow;
  if (elapsed < HOUR) return labels.minutes(Math.floor(elapsed / MINUTE));
  if (elapsed < DAY) return labels.hours(Math.floor(elapsed / HOUR));
  return labels.days(Math.floor(elapsed / DAY));
}
