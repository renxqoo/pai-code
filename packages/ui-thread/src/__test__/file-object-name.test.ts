import { describe, expect, test } from 'bun:test';

import { objectName } from '../file-object-name';

describe('objectName 路径 → 文件名', () => {
  test('只显文件名，不露目录层级', () => {
    expect(objectName('apps/electron/src/thread/file-diff-section.tsx')).toBe('file-diff-section.tsx');
    expect(objectName('a.ts')).toBe('a.ts');
    expect(objectName('dir\\win.ts')).toBe('win.ts');
  });

  test('首尾引号剥掉（复制出的路径常带引号），其余原样', () => {
    expect(objectName('"src/a.ts"')).toBe('a.ts');
    expect(objectName("'src/a.ts'")).toBe('a.ts');
    expect(objectName('`src/a.ts`')).toBe('a.ts');
    expect(objectName('src/a"b.ts')).toBe('a"b.ts');
  });

  test('垃圾输入安全降级', () => {
    expect(objectName('')).toBe('');
    expect(objectName('///')).toBe('///');
  });
});
