import { describe, expect, test } from 'bun:test';

import { PERM_MODES, PermModeSchema, currentPermModes, normalizeLegacyPermMode, setPermModes } from '../permissions';

/** 权限模式词表（host-hub 词表的内置缺省面 + 动态收敛——单一真相在 host）。 */

describe('PermMode 词表', () => {
  test('内置缺省五档且顺序稳定（host 缺席时的 UI 选项顺序）', () => {
    expect([...PERM_MODES]).toEqual(['plan', 'auto', 'edit-confirm', 'full', 'sandboxed-auto']);
  });

  test.each([['yolo'], ['default'], ['acceptEdits'], ['fullAuto'], [''], ['Plan']])('词表外拒绝：%s', (bad) => {
    expect(() => PermModeSchema.parse(bad)).toThrow();
  });

  test.each([...PERM_MODES])('词表内通过：%s', (mode) => {
    expect(PermModeSchema.parse(mode)).toBe(mode);
  });
});

describe('动态词表收敛（host modes 单一真相）', () => {
  test('setPermModes 收敛后 currentPermModes 即 host 词表；schema 随词表放行新档', () => {
    setPermModes(['plan', 'auto', 'edit-confirm', 'full', 'sandboxed-auto']);
    expect(currentPermModes()).toEqual(['plan', 'auto', 'edit-confirm', 'full', 'sandboxed-auto']);
    expect(PermModeSchema.parse('edit-confirm')).toBe('edit-confirm');
  });

  test('host 协议扩档：收敛后新档立即可选（UI 零改）', () => {
    setPermModes(['plan', 'auto', 'edit-confirm', 'full', 'sandboxed-auto', 'future-mode']);
    expect(PermModeSchema.parse('future-mode')).toBe('future-mode');
    expect(() => PermModeSchema.parse('auto')).not.toThrow();
  });

  test('空词表拒绝收敛（防 host 坏响应清空选项面）', () => {
    setPermModes(['plan']);
    setPermModes([]);
    expect(currentPermModes()).toEqual(['plan']);
  });

  test('收敛后词表外仍拒绝', () => {
    setPermModes(['plan', 'auto', 'edit-confirm', 'full', 'sandboxed-auto']);
    expect(() => PermModeSchema.parse('yolo')).toThrow();
    expect(() => PermModeSchema.parse('AUTO')).toThrow();
  });
});

/** 旧 4 档读盘归一（存量值 → 现词表；判断职责在 isPermMode/读侧组合——本函数只做映射）。 */
describe('normalizeLegacyPermMode 映射表', () => {
  test.each([
    ['default', 'auto'],
    ['acceptEdits', 'auto'],
    ['fullAuto', 'full'],
  ])('%s → %s', (input, expected) => {
    expect(normalizeLegacyPermMode(input)).toBe(expected);
  });

  test.each([['yolo'], ['plan-auto'], [''], ['AUTO'], ['unset'], ['plan'], ['auto'], ['full']])('无映射 → undefined：%s', (value) => {
    expect(normalizeLegacyPermMode(value)).toBeUndefined();
  });
});
