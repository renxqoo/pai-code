import { describe, expect, test } from 'bun:test';

import { copy } from '@/strings';
import { permModeLabel } from '../perm-mode-label';

/** 权限模式展示名解析（已知档查双语词表 / 词表外回退 id 本身）。 */

describe('permModeLabel', () => {
  test('已知档查双语词表', () => {
    expect(permModeLabel('auto')).toBe(copy.settings.permModeOptions.auto);
    expect(permModeLabel('sandboxed-auto')).toBe(copy.settings.permModeOptions['sandboxed-auto']);
  });

  test('词表外档（host 扩档、文案未收录）回退 id 本身——新档可见可选，不崩', () => {
    expect(permModeLabel('future-mode')).toBe('future-mode');
    expect(permModeLabel('')).toBe('');
  });
});
