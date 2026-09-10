import { expect, test } from 'bun:test';

import { resolveCmdHotkey } from '../cmd-hotkeys';

const NOMOD = { meta: true, ctrl: false, alt: false, shift: false };
const SHIFT = { meta: true, ctrl: false, alt: false, shift: true };

test('⌘N/⌘K 命中（大小写两种形态）', () => {
  expect(resolveCmdHotkey(NOMOD, 'n')).toBe('newThread');
  expect(resolveCmdHotkey(NOMOD, 'N')).toBe('newThread');
  expect(resolveCmdHotkey(NOMOD, 'k')).toBe('search');
  expect(resolveCmdHotkey(NOMOD, 'K')).toBe('search');
});

test('⌘⇧D/⌘⇧A 切换面板（shift 大小写两种形态；Ctrl 平台同命中）', () => {
  expect(resolveCmdHotkey(SHIFT, 'd')).toBe('toggleDiff');
  expect(resolveCmdHotkey(SHIFT, 'D')).toBe('toggleDiff');
  expect(resolveCmdHotkey(SHIFT, 'a')).toBe('toggleAgents');
  expect(resolveCmdHotkey(SHIFT, 'A')).toBe('toggleAgents');
  expect(resolveCmdHotkey({ meta: false, ctrl: true, alt: false, shift: true }, 'd')).toBe('toggleDiff');
});

test('shift 只认 D/A；裸 ⌘D/⌘A 不劫持（编辑器/系统语义）', () => {
  expect(resolveCmdHotkey(SHIFT, 'n')).toBeNull();
  expect(resolveCmdHotkey(SHIFT, 'k')).toBeNull();
  expect(resolveCmdHotkey(NOMOD, 'd')).toBeNull();
  expect(resolveCmdHotkey(NOMOD, 'a')).toBeNull();
});

test('Ctrl+N/K 同样命中（非 macOS 平台）', () => {
  expect(resolveCmdHotkey({ meta: false, ctrl: true, alt: false, shift: false }, 'n')).toBe('newThread');
  expect(resolveCmdHotkey({ meta: false, ctrl: true, alt: false, shift: false }, 'k')).toBe('search');
});

test('无修饰键或 Alt 组合不劫持', () => {
  expect(resolveCmdHotkey({ meta: false, ctrl: false, alt: false, shift: false }, 'n')).toBeNull();
  expect(resolveCmdHotkey({ meta: true, ctrl: false, alt: true, shift: false }, 'n')).toBeNull();
  expect(resolveCmdHotkey({ meta: false, ctrl: true, alt: true, shift: false }, 'k')).toBeNull();
  expect(resolveCmdHotkey({ meta: true, ctrl: false, alt: true, shift: true }, 'd')).toBeNull();
});

test('其他键位不命中', () => {
  expect(resolveCmdHotkey(NOMOD, 'j')).toBeNull();
  expect(resolveCmdHotkey(NOMOD, 'Enter')).toBeNull();
});
