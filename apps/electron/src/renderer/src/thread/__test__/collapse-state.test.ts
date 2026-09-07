import { describe, expect, test } from 'bun:test';

import { autoOpenForTurn, flipPref, resolveOpen } from '../collapse-state';

describe('autoOpenForTurn', () => {
  test('运行中的轮自动展开，结束的轮折叠为摘要', () => {
    expect(autoOpenForTurn('running')).toBe(true);
    expect(autoOpenForTurn('completed')).toBe(false);
    expect(autoOpenForTurn('stopped')).toBe(false);
  });
});

describe('resolveOpen', () => {
  test('手动意图优先于自动状态（自动折叠不再收起用户点开的块）', () => {
    expect(resolveOpen(true, false)).toBe(true);
    expect(resolveOpen(false, true)).toBe(false);
  });

  test('未表态时跟随自动状态', () => {
    expect(resolveOpen(null, true)).toBe(true);
    expect(resolveOpen(null, false)).toBe(false);
  });
});

describe('flipPref', () => {
  test('从自动展开状态点击 → 记录手动收起', () => {
    expect(flipPref(null, true)).toBe(false);
  });

  test('从手动收起状态再点击 → 回到手动展开', () => {
    expect(flipPref(false, true)).toBe(true);
    expect(flipPref(false, false)).toBe(true);
  });

  test('从手动展开状态再点击 → 回到手动收起（自动折叠不再收起它）', () => {
    expect(flipPref(true, false)).toBe(false);
    expect(flipPref(true, true)).toBe(false);
  });
});
