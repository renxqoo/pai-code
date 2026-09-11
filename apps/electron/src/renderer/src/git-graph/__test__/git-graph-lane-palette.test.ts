import { describe, expect, test } from 'bun:test';

import { laneColor } from '../git-graph-lane-palette';

/** 泳道调色板：8 色循环、负序号安全取模、三组类名（stroke/fill/text）对齐同一色相。 */
describe('laneColor', () => {
  test('序号 0-7 依次取八色，8 循环回橙色领衔', () => {
    const firstRound = Array.from({ length: 8 }, (_, lane) => laneColor(lane).stroke);
    expect(new Set(firstRound).size).toBe(8);
    expect(firstRound[0]).toContain('orange');
    expect(firstRound[1]).toContain('blue');
    expect(laneColor(8).stroke).toBe(firstRound[0]);
  });

  test.each([-1, -9, 15, 100])('序号 %d 安全取模不越界', (lane: number) => {
    const color = laneColor(lane);
    expect(color.stroke.length).toBeGreaterThan(0);
    expect(color.fill).toBeTruthy();
    expect(color.text).toBeTruthy();
  });

  test('同序号三组类名同色相（stroke/fill/text 同名色）', () => {
    const color = laneColor(2);
    expect(color.stroke).toContain('emerald');
    expect(color.fill).toContain('emerald');
    expect(color.text).toContain('emerald');
    expect(color.stroke).toContain('dark:stroke-emerald-500');
  });
});
