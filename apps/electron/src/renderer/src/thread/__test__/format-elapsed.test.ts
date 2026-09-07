import { describe, expect, test } from 'bun:test';

import { formatElapsed } from '../format-elapsed';

describe('formatElapsed', () => {
  test('秒 <60 显 Xs（设计稿面板项 29s / 6s）', () => {
    expect(formatElapsed(29_000)).toBe('29s');
    expect(formatElapsed(6_000)).toBe('6s');
    expect(formatElapsed(59_999)).toBe('59s');
  });

  test('≥60 显 Xm Ys（设计稿 Working for 1m 16s）', () => {
    expect(formatElapsed(76_000)).toBe('1m 16s');
    expect(formatElapsed(128_000)).toBe('2m 8s');
    expect(formatElapsed(60_000)).toBe('1m 0s');
  });

  test('零、负值与非有限输入降级为 0s，不输出负数', () => {
    expect(formatElapsed(0)).toBe('0s');
    expect(formatElapsed(-3_000)).toBe('0s');
    expect(formatElapsed(Number.NaN)).toBe('0s');
    expect(formatElapsed(Number.POSITIVE_INFINITY)).toBe('0s');
  });
});
