import { describe, expect, test } from 'bun:test';
import { ReplayHarness } from '../index';

describe('ReplayHarness', () => {
  test('step 按序投递，耗尽返回 null', () => {
    const got: number[] = [];
    const h = new ReplayHarness((n) => got.push(n), [1, 2, 3]);
    expect(h.step()).toBe(1);
    expect(h.step()).toBe(2);
    expect(h.step()).toBe(3);
    expect(h.step()).toBeNull();
    expect(got).toEqual([1, 2, 3]);
    expect(h.remaining()).toBe(0);
  });

  test('stop 后 step/run 不再投递', () => {
    const got: number[] = [];
    const h = new ReplayHarness((n) => got.push(n), [1, 2, 3]);
    h.step();
    h.stop();
    expect(h.step()).toBeNull();
    expect(got).toEqual([1]);
  });

  test.each([
    ['speed 非正数', { speed: 0 }],
    ['speed 非有限数', { speed: Number.NaN }],
    ['interval 为负', { intervalMs: -1 }],
    ['interval 非有限数', { intervalMs: Number.NaN }],
  ])('非法参数拒绝：%s', (_n, bad) => {
    expect(() => new ReplayHarness(() => {}, [1], bad)).toThrow();
  });

  test('NaN 参数不再绕过校验（回归：旧实现 NaN 比较为 false）', () => {
    expect(() => new ReplayHarness(() => {}, [1], { intervalMs: Number.NaN })).toThrow('interval_ms_invalid');
    expect(() => new ReplayHarness(() => {}, [1], { speed: Number.NaN })).toThrow('speed_invalid');
  });

  test('并发 run 复用同一次执行（Promise 同引用）', async () => {
    const got: number[] = [];
    const h = new ReplayHarness((n) => got.push(n), [1, 2, 3], { intervalMs: 2 });
    const p1 = h.run();
    const p2 = h.run();
    expect(p2).toBe(p1);
    await p1;
    expect(got).toEqual([1, 2, 3]);
  });

  test('plannedInterval 按 speed 缩放', () => {
    const h = new ReplayHarness(() => {}, [1], { intervalMs: 100, speed: 2 });
    expect(h.plannedInterval()).toBe(50);
  });

  test('run 完整投递且保持顺序（真实小间隔冒烟）', async () => {
    const got: number[] = [];
    const h = new ReplayHarness((n) => got.push(n), [1, 2, 3, 4], { intervalMs: 2 });
    await h.run();
    expect(got).toEqual([1, 2, 3, 4]);
  });

  test('run 中途 stop 提前结束', async () => {
    const got: number[] = [];
    const h = new ReplayHarness((n) => got.push(n), [1, 2, 3, 4, 5], { intervalMs: 5 });
    setTimeout(() => h.stop(), 12);
    await h.run();
    expect(got.length).toBeLessThan(5);
    expect(got.length).toBeGreaterThanOrEqual(1);
  });
});
