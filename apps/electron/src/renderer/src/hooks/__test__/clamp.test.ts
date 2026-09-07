import { describe, expect, test } from 'bun:test';

import { clamp } from '../clamp';

describe('clamp', () => {
  test('低于下界取下界，高于上界取上界', () => {
    expect(clamp(100, 168, 320)).toBe(168);
    expect(clamp(999, 168, 320)).toBe(320);
  });

  test('区间内返回原值', () => {
    expect(clamp(188, 168, 320)).toBe(188);
  });

  test('下界等于上界时锁定该值', () => {
    expect(clamp(50, 200, 200)).toBe(200);
  });
});
