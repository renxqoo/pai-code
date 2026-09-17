import { describe, expect, test } from 'bun:test';

import { PERM_MODES, PermModeSchema } from '../permissions';

/** 权限模式词表（host-hub permission/set_mode|get_mode 与 settings 键共用枚举）。 */

describe('PermMode 词表', () => {
  test('四档封闭且顺序稳定（UI 选项顺序）', () => {
    expect([...PERM_MODES]).toEqual(['plan', 'default', 'acceptEdits', 'fullAuto']);
    expect([...PermModeSchema.options]).toEqual([...PERM_MODES]);
  });

  test.each([['yolo'], ['accept'], [''], ['Plan']])('词表外拒绝：%s', (bad) => {
    expect(() => PermModeSchema.parse(bad)).toThrow();
  });

  test.each([...PERM_MODES])('词表内通过：%s', (mode) => {
    expect(PermModeSchema.parse(mode)).toBe(mode);
  });
});
