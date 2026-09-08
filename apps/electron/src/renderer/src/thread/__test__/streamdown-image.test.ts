import { describe, expect, test } from 'bun:test';

import { safeImageSrc } from '../streamdown-image';

describe('safeImageSrc', () => {
  test('http(s) 外链放行（大小写不敏感）', () => {
    expect(safeImageSrc('https://example.com/a.png')).toBe('https://example.com/a.png');
    expect(safeImageSrc('HTTP://example.com/a.png')).toBe('HTTP://example.com/a.png');
  });

  test('data:image/ 内联与 blob: 会话图放行（与用户消息图片形态一致）', () => {
    expect(safeImageSrc('data:image/png;base64,AAAA')).toBe('data:image/png;base64,AAAA');
    expect(safeImageSrc('blob:https://example.com/uuid')).toBe('blob:https://example.com/uuid');
  });

  test('危险与非常规协议一律拒绝（不渲染为图片、不产生请求）', () => {
    expect(safeImageSrc('javascript:alert(1)')).toBeNull();
    expect(safeImageSrc('file:///etc/passwd')).toBeNull();
    expect(safeImageSrc('data:text/html;base64,PHNjcmlwdD4=')).toBeNull();
    expect(safeImageSrc('ftp://example.com/a.png')).toBeNull();
  });

  test('undefined 与空白降级为 null', () => {
    expect(safeImageSrc(undefined)).toBeNull();
    expect(safeImageSrc('   ')).toBeNull();
  });
});
