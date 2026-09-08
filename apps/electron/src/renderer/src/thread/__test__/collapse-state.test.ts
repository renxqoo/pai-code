import { describe, expect, test } from 'bun:test';

import { autoOpenForTurn, resolveOpen } from '../collapse-state';

describe('autoOpenForTurn', () => {
  test('运行中的轮自动展开，结束的轮收起为摘要 + 最终文本', () => {
    expect(autoOpenForTurn('running')).toBe(true);
    expect(autoOpenForTurn('completed')).toBe(false);
    expect(autoOpenForTurn('stopped')).toBe(false);
  });
});

describe('resolveOpen', () => {
  test('手动意图优先于自动状态（自动收起不再收回用户展开的过程）', () => {
    expect(resolveOpen(true, false)).toBe(true);
    expect(resolveOpen(false, true)).toBe(false);
  });

  test('未表态时跟随自动状态', () => {
    expect(resolveOpen(null, true)).toBe(true);
    expect(resolveOpen(null, false)).toBe(false);
  });
});
