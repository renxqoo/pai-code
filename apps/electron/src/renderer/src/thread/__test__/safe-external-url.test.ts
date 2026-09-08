import { describe, expect, test } from 'bun:test';

import { safeExternalUrl } from '../safe-external-url';

describe('safeExternalUrl', () => {
  test('仅放行 http(s)', () => {
    expect(safeExternalUrl('https://example.com/a?b=1')).toBe('https://example.com/a?b=1');
    expect(safeExternalUrl('http://example.com')).toBe('http://example.com');
  });

  test('协议大小写不敏感，首尾空白被修剪', () => {
    expect(safeExternalUrl('HTTPS://EXAMPLE.COM')).toBe('HTTPS://EXAMPLE.COM');
    expect(safeExternalUrl('  https://example.com  ')).toBe('https://example.com');
  });

  test('危险协议与相对地址一律拒绝', () => {
    expect(safeExternalUrl('javascript:alert(1)')).toBeNull();
    expect(safeExternalUrl('JAVASCRIPT:alert(1)')).toBeNull();
    expect(safeExternalUrl('file:///etc/passwd')).toBeNull();
    expect(safeExternalUrl('data:text/html,<script>alert(1)</script>')).toBeNull();
    expect(safeExternalUrl('mailto:user@example.com')).toBeNull();
  });

  test('缺相对协议的地址（锚点/相对路径/协议相对）不放行为外链', () => {
    expect(safeExternalUrl('#section')).toBeNull();
    expect(safeExternalUrl('docs/readme.md')).toBeNull();
    expect(safeExternalUrl('//example.com/a')).toBeNull();
    expect(safeExternalUrl('/absolute/path')).toBeNull();
  });

  test('undefined 与空串拒绝', () => {
    expect(safeExternalUrl(undefined)).toBeNull();
    expect(safeExternalUrl('')).toBeNull();
    expect(safeExternalUrl('   ')).toBeNull();
  });
});
