import { describe, expect, test } from 'bun:test';

import { formatCountUnit, formatDiffDelta, formatTokenCount } from '../format-count-unit';

describe('formatCountUnit', () => {
  test('千位以下原样输出（设计稿 375 changed files / 755 tok）', () => {
    expect(formatCountUnit(375)).toBe('375');
    expect(formatCountUnit(755)).toBe('755');
    expect(formatCountUnit(0)).toBe('0');
  });

  test('千位以上以 k 计并去掉无意义的 .0（+34k / 1.4k / 6.6k）', () => {
    expect(formatCountUnit(34_000)).toBe('34k');
    expect(formatCountUnit(1400)).toBe('1.4k');
    expect(formatCountUnit(6600)).toBe('6.6k');
    expect(formatCountUnit(1000)).toBe('1k');
    expect(formatCountUnit(999.6)).toBe('1k');
  });

  test('垃圾输入降级为 0', () => {
    expect(formatCountUnit(-5)).toBe('0');
    expect(formatCountUnit(Number.NaN)).toBe('0');
  });
});

describe('formatDiffDelta', () => {
  test('diff 增删行数按字段语义取符号（模型只存量级）', () => {
    expect(formatDiffDelta('add', 34_000)).toBe('+34k');
    expect(formatDiffDelta('del', 16_000)).toBe('-16k');
    expect(formatDiffDelta('add', 0)).toBe('+0');
    expect(formatDiffDelta('del', 0)).toBe('-0');
  });
});

describe('formatTokenCount', () => {
  test('无计量返回 null，有计量走同一计数形态', () => {
    expect(formatTokenCount(null)).toBeNull();
    expect(formatTokenCount(196)).toBe('196');
    expect(formatTokenCount(1400)).toBe('1.4k');
  });
});
