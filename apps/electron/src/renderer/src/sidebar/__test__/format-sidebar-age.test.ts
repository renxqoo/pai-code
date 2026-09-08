import { expect, test } from 'bun:test';

import { formatSidebarAge, type SidebarAgeLabels } from '../format-sidebar-age';

const labels: SidebarAgeLabels = {
  justNow: '刚刚',
  minutes: (n) => `${n}分钟`,
  hours: (n) => `${n}小时`,
  days: (n) => `${n}天`,
};

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

test('边界表：刚刚 / 分钟 / 小时 / 天 分段', () => {
  const now = 1_000_000_000_000;
  const cases: ReadonlyArray<[number, string]> = [
    [0, '刚刚'],
    [59 * SECOND, '刚刚'],
    [MINUTE, '1分钟'],
    [2 * MINUTE + 30 * SECOND, '2分钟'],
    [59 * MINUTE + 59 * SECOND, '59分钟'],
    [HOUR, '1小时'],
    [3 * HOUR, '3小时'],
    [23 * HOUR + 59 * MINUTE, '23小时'],
    [DAY, '1天'],
    [2 * DAY + 5 * HOUR, '2天'],
    [30 * DAY, '30天'],
  ];
  for (const [elapsed, expected] of cases) {
    expect(formatSidebarAge(now, now - elapsed, labels)).toBe(expected);
  }
});

test('未来时间按刚刚（不产生负数标签）', () => {
  const now = 1_000_000_000_000;
  expect(formatSidebarAge(now, now + 10 * MINUTE, labels)).toBe('刚刚');
});

test('文案注入：formatter 不内嵌 locale', () => {
  const en: SidebarAgeLabels = {
    justNow: 'now',
    minutes: (n) => `${n}m`,
    hours: (n) => `${n}h`,
    days: (n) => `${n}d`,
  };
  const now = 1_000_000_000_000;
  expect(formatSidebarAge(now, now - 90 * MINUTE, en)).toBe('1h');
});
