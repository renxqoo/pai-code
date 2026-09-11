import { describe, expect, test } from 'bun:test';

import { formatGitGraphDate } from '../git-graph-date';

/** 日期列格式：'MM/DD HH:mm' 本地时区，个位补零（构造用本地 Date，不绑测试机时区）。 */
describe('formatGitGraphDate', () => {
  test.each([
    ['常规', new Date(2026, 8, 12, 3, 4), '09/12 03:04'],
    ['两位日月与时分原样', new Date(2026, 10, 25, 13, 57), '11/25 13:57'],
    ['跨年边界', new Date(2026, 0, 1, 0, 0), '01/01 00:00'],
    ['年末', new Date(2026, 11, 31, 23, 59), '12/31 23:59'],
  ])('%s', (_name: string, date: Date, expected: string) => {
    expect(formatGitGraphDate(Math.floor(date.getTime() / 1000))).toBe(expected);
  });
});
