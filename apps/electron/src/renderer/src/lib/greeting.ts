/** 问候语时段键（新建任务页按本地时间择一）。 */
export type GreetingKey = 'night' | 'morning' | 'afternoon' | 'evening';

/**
 * 本地小时 → 时段（四段：0-4 夜 / 5-11 早 / 12-17 午 / 18-23 晚）。
 * 越界/非整数按夜段降级（垃圾输入不抛错）。
 */
export function greetingKeyOf(hour: number): GreetingKey {
  if (!Number.isFinite(hour)) return 'night';
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 18) return 'afternoon';
  if (hour >= 18 && hour < 24) return 'evening';
  return 'night';
}
