import { describe, expect, test } from 'bun:test';

import { createSampleRing } from '../sample-ring';
import { createSupervisionLog } from '../supervision-log';

describe('createSampleRing（资源采样环）', () => {
  test('先进先出：超限丢弃最旧，新在尾', () => {
    const ring = createSampleRing<number>(3);
    ring.push(1);
    ring.push(2);
    ring.push(3);
    ring.push(4);
    expect(ring.samples()).toEqual([2, 3, 4]);
    expect(ring.latest()).toBe(4);
  });

  test('latest 空环为 null；samples 是快照（外部可变不影响内部）', () => {
    const ring = createSampleRing<{ v: number }>(2);
    expect(ring.latest()).toBeNull();
    ring.push({ v: 1 });
    const snap = ring.samples();
    snap.push({ v: 99 });
    expect(ring.samples().length).toBe(1);
  });

  test.each([0, -1, 1.5])('非法上限抛错：%p', (bad: number) => {
    expect(() => createSampleRing<number>(bad)).toThrow();
  });
});

describe('createSupervisionLog（监督事件环）', () => {
  const event = (at: number) => ({ at, level: 'info' as const, kind: 'host_phase' as const, detail: `${at}` });

  test('定长环 + 时间升序（新在尾）', () => {
    const log = createSupervisionLog(2);
    log.record(event(1));
    log.record(event(2));
    log.record(event(3));
    expect(log.list().map((e) => e.at)).toEqual([2, 3]);
  });

  test.each([0, -3, 2.5])('非法上限抛错：%p', (bad: number) => {
    expect(() => createSupervisionLog(bad)).toThrow();
  });
});
