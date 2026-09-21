import { describe, expect, test } from 'bun:test';

import { PERM_MODES, PermModeSchema, normalizeLegacyPermMode } from '../permissions';

/** 权限模式词表（x-harness host-hub permission/set_mode|get_mode 与 settings 键共用枚举）。 */

describe('PermMode 词表', () => {
  test('三档封闭且顺序稳定（UI 选项顺序）', () => {
    expect([...PERM_MODES]).toEqual(['plan', 'auto', 'full']);
    expect([...PermModeSchema.options]).toEqual([...PERM_MODES]);
  });

  test.each([['yolo'], ['default'], ['acceptEdits'], ['fullAuto'], [''], ['Plan']])('词表外拒绝：%s', (bad) => {
    expect(() => PermModeSchema.parse(bad)).toThrow();
  });

  test.each([...PERM_MODES])('词表内通过：%s', (mode) => {
    expect(PermModeSchema.parse(mode)).toBe(mode);
  });
});

/** 旧 4 档读盘归一（my-agent 期词形 → x-harness 3 档；写侧只产新词表）。 */
describe('normalizeLegacyPermMode 映射表', () => {
  test.each([
    ['plan', 'plan'],
    ['auto', 'auto'],
    ['full', 'full'],
    ['default', 'auto'],
    ['acceptEdits', 'auto'],
    ['fullAuto', 'full'],
  ])('%s → %s', (input, expected) => {
    expect(normalizeLegacyPermMode(input)).toBe(expected);
  });

  test.each([['yolo'], ['plan-auto'], [''], ['AUTO'], ['unset']])('词表外语形 → undefined（视为未设置）：%s', (bad) => {
    expect(normalizeLegacyPermMode(bad)).toBeUndefined();
  });
});
