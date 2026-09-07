import { describe, expect, test } from 'bun:test';

import { formatRelativeAge } from '../relative-age';

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

describe('formatRelativeAge', () => {
  const now = 1_800_000_000_000;

  test('天数取整输出 d 标记（设计稿卡片右上角 3d / 2d）', () => {
    expect(formatRelativeAge(now, now - 3 * DAY)).toBe('3d');
    expect(formatRelativeAge(now, now - 2 * DAY)).toBe('2d');
    expect(formatRelativeAge(now, now - 36 * HOUR)).toBe('1d');
  });

  test('不足一天输出小时标记', () => {
    expect(formatRelativeAge(now, now - 5 * HOUR)).toBe('5h');
  });

  test('不足一小时输出分钟标记，最低 1m', () => {
    expect(formatRelativeAge(now, now - 9 * MINUTE)).toBe('9m');
    expect(formatRelativeAge(now, now - 20_000)).toBe('1m');
  });

  test('未来时间戳与瞬时差按 1m 降级，不输出负数', () => {
    expect(formatRelativeAge(now, now + 2 * HOUR)).toBe('1m');
    expect(formatRelativeAge(now, now)).toBe('1m');
  });
});
