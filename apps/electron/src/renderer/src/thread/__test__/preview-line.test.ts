import { describe, expect, test } from 'bun:test';

import { previewLine } from '../preview-line';

describe('previewLine', () => {
  test('取首个非空行并压平空白', () => {
    expect(previewLine('\n \n第二行才是内容\n第三行')).toBe('第二行才是内容');
    expect(previewLine('  换   行\t空白  ')).toBe('换 行 空白');
  });

  test('垃圾输入降级为空串', () => {
    expect(previewLine('')).toBe('');
    expect(previewLine('\n  \n')).toBe('');
  });

  test('超长行截断加省略号', () => {
    const long = 'a'.repeat(200);
    const out = previewLine(long);
    expect(out).toHaveLength(120);
    expect(out.endsWith('…')).toBe(true);
  });
});
