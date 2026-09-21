import { expect, test } from 'bun:test';

import { PERM_MODES, type PermMode } from '@paiapp/contracts';

import { isPermMode, normalizePermMode } from '../permission-mode';

/** 权限模式词表辅助：读口宽松 string 收敛（词表内原样、词表外回落 default 档）。 */

test('isPermMode：词表内识别（permission/get_mode|set_mode 与 app/hubSettings 共用枚举）', () => {
  for (const mode of PERM_MODES) {
    expect(isPermMode(mode)).toBe(true);
  }
});

test('isPermMode：词表外与垃圾输入拒绝', () => {
  for (const value of ['ask', 'allow-all', 'block-all', '', 'FULLAUTO', 'default ']) {
    expect(isPermMode(value)).toBe(false);
  }
});

test.each(PERM_MODES)('normalizePermMode：词表内 %s 原样返回', (mode: PermMode) => {
  expect(normalizePermMode(mode)).toBe(mode);
});

test('normalizePermMode：词表外（协议扩展/垃圾输入）回落 auto 档（不崩溃不臆造新模式）', () => {
  expect(normalizePermMode('ask')).toBe('auto');
  expect(normalizePermMode('')).toBe('auto');
  expect(normalizePermMode('full-auto')).toBe('auto');
});

test('normalizePermMode：旧 4 档存量值归一（my-agent 期写入 hub-settings 的读盘收敛）', () => {
  expect(normalizePermMode('default')).toBe('auto');
  expect(normalizePermMode('acceptEdits')).toBe('auto');
  expect(normalizePermMode('fullAuto')).toBe('full');
  expect(normalizePermMode('plan')).toBe('plan');
});
