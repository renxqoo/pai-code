import { describe, expect, test } from 'bun:test';

import { formatClockTime } from '../format-clock-time';

describe('formatClockTime', () => {
  test('12 小时制 + 两位分钟（设计稿 10:46 AM）', () => {
    // 2026-09-07 10:46 local
    const at = new Date(2026, 8, 7, 10, 46).getTime();
    expect(formatClockTime(at)).toBe('10:46 AM');
  });

  test('下午与零点边界', () => {
    expect(formatClockTime(new Date(2026, 8, 7, 15, 5).getTime())).toBe('3:05 PM');
    expect(formatClockTime(new Date(2026, 8, 7, 0, 0).getTime())).toBe('12:00 AM');
    expect(formatClockTime(new Date(2026, 8, 7, 12, 0).getTime())).toBe('12:00 PM');
  });

  test('非有限时刻输出空形态，不抛错', () => {
    expect(formatClockTime(Number.NaN)).toBe('');
  });
});
