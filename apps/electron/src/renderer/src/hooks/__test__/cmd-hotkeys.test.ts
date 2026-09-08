import { expect, test } from 'bun:test';

import { resolveCmdHotkey } from '../cmd-hotkeys';

test('⌘N/⌘K 命中（大小写两种形态）', () => {
  expect(resolveCmdHotkey({ meta: true, ctrl: false, alt: false }, 'n')).toBe('newThread');
  expect(resolveCmdHotkey({ meta: true, ctrl: false, alt: false }, 'N')).toBe('newThread');
  expect(resolveCmdHotkey({ meta: true, ctrl: false, alt: false }, 'k')).toBe('search');
  expect(resolveCmdHotkey({ meta: true, ctrl: false, alt: false }, 'K')).toBe('search');
});

test('Ctrl+N/K 同样命中（非 macOS 平台）', () => {
  expect(resolveCmdHotkey({ meta: false, ctrl: true, alt: false }, 'n')).toBe('newThread');
  expect(resolveCmdHotkey({ meta: false, ctrl: true, alt: false }, 'k')).toBe('search');
});

test('无修饰键或 Alt 组合不劫持', () => {
  expect(resolveCmdHotkey({ meta: false, ctrl: false, alt: false }, 'n')).toBeNull();
  expect(resolveCmdHotkey({ meta: true, ctrl: false, alt: true }, 'n')).toBeNull();
  expect(resolveCmdHotkey({ meta: false, ctrl: true, alt: true }, 'k')).toBeNull();
});

test('其他键位不命中', () => {
  expect(resolveCmdHotkey({ meta: true, ctrl: false, alt: false }, 'j')).toBeNull();
  expect(resolveCmdHotkey({ meta: true, ctrl: false, alt: false }, 'Enter')).toBeNull();
});
