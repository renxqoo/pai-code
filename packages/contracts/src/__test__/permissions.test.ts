import { describe, expect, test } from 'bun:test';

import {
  PERM_MODES,
  PermModeSchema,
  isKnownPermMode,
  mapLegacyPermMode,
  normalizePermMode,
  permVocabOf,
  resolveStoredPermMode,
} from '../permissions';

/** 权限模式词表语义（纯函数面——词表随数据传参，无模块状态；词表单一真相 = host modes）。 */

describe('PermMode 词表静态面', () => {
  test('内置缺省五档且顺序稳定（host 缺席时的 UI 选项顺序）', () => {
    expect([...PERM_MODES]).toEqual(['plan', 'auto', 'edit-confirm', 'full', 'sandboxed-auto']);
  });

  test.each([...PERM_MODES])('isKnownPermMode 词表内识别：%s', (mode) => {
    expect(isKnownPermMode(mode)).toBe(true);
  });

  test.each([['yolo'], [''], ['Plan'], ['full-auto'], ['future-mode'], ['default']])('isKnownPermMode 词表外拒绝：%s', (value) => {
    expect(isKnownPermMode(value)).toBe(false);
  });
});

describe('PermModeSchema 形态护栏（值域校验单点 = host，app 不做第二校验点）', () => {
  test('空串拒绝（发前垃圾拦截）', () => {
    expect(() => PermModeSchema.parse('')).toThrow();
  });

  test.each([...PERM_MODES, 'future-mode', 'yolo', 'fullAuto'])('非空放行（含 host 扩档——协议加档零发版）：%s', (value) => {
    expect(PermModeSchema.parse(value)).toBe(value);
  });
});

describe('mapLegacyPermMode 旧档映射（纯映射；现词表值不直通）', () => {
  test.each([
    ['default', 'auto'],
    ['acceptEdits', 'auto'],
    ['fullAuto', 'full'],
  ])('%s → %s', (input, expected) => {
    expect(mapLegacyPermMode(input)).toBe(expected);
  });

  test.each([['yolo'], ['plan-auto'], [''], ['AUTO'], ['unset'], ['plan'], ['auto'], ['full'], ['edit-confirm'], ['future-mode']])('无映射 → undefined：%s', (value) => {
    expect(mapLegacyPermMode(value)).toBeUndefined();
  });
});

describe('normalizePermMode 展示收敛（vocab 参数化）', () => {
  test.each([...PERM_MODES])('词表内原样返回：%s', (mode) => {
    expect(normalizePermMode(mode, PERM_MODES)).toBe(mode);
  });

  test.each([
    ['default', 'auto'],
    ['acceptEdits', 'auto'],
    ['fullAuto', 'full'],
  ])('旧档归一：%s → %s', (input, expected) => {
    expect(normalizePermMode(input, PERM_MODES)).toBe(expected);
  });

  test.each([['ask'], [''], ['full-auto'], ['yolo']])('词表外（协议扩展/垃圾输入）回落 auto（不崩溃不臆造新模式）：%s', (value) => {
    expect(normalizePermMode(value, PERM_MODES)).toBe('auto');
  });

  test('症状回归：host 扩档（modes 回传进 vocab）新档原样返回——不靠本地模块状态', () => {
    const vocab = [...PERM_MODES, 'future-mode'];
    expect(normalizePermMode('future-mode', vocab)).toBe('future-mode');
    expect(normalizePermMode('future-mode', PERM_MODES)).toBe('auto');
  });
});

describe('resolveStoredPermMode 读盘收敛（settings 键 permission.defaultMode）', () => {
  test.each([
    ['default', 'auto'],
    ['acceptEdits', 'auto'],
    ['fullAuto', 'full'],
  ])('旧档映射：%s → %s', (input, expected) => {
    expect(resolveStoredPermMode(input, PERM_MODES)).toBe(expected);
  });

  test('词表内透传（归一展示不丢语义）', () => {
    expect(resolveStoredPermMode('edit-confirm', PERM_MODES)).toBe('edit-confirm');
  });

  test('host 扩档（vocab 携新档）原样透传——不被 null 掉', () => {
    expect(resolveStoredPermMode('future-mode', [...PERM_MODES, 'future-mode'])).toBe('future-mode');
  });

  test('词表外视为未设置（null）', () => {
    expect(resolveStoredPermMode('yolo', PERM_MODES)).toBeNull();
    expect(resolveStoredPermMode('', PERM_MODES)).toBeNull();
    expect(resolveStoredPermMode('future-mode', PERM_MODES)).toBeNull();
  });
});

describe('permVocabOf host 词表载荷收敛', () => {
  test('合法非空数组原样取（副本）', () => {
    const host = ['plan', 'auto', 'future-mode'];
    const vocab = permVocabOf(host);
    expect(vocab).toEqual(host);
    expect(vocab).not.toBe(host);
  });

  test('缺席/坏值回落内置缺省', () => {
    expect(permVocabOf(undefined)).toEqual([...PERM_MODES]);
    expect(permVocabOf(null)).toEqual([...PERM_MODES]);
    expect(permVocabOf('plan')).toEqual([...PERM_MODES]);
    expect(permVocabOf({ modes: ['plan'] })).toEqual([...PERM_MODES]);
    expect(permVocabOf(['plan', 1])).toEqual([...PERM_MODES]);
    expect(permVocabOf([''])).toEqual([...PERM_MODES]);
  });

  test('空数组拒收（防坏响应清空选项面）', () => {
    expect(permVocabOf([])).toEqual([...PERM_MODES]);
  });
});
