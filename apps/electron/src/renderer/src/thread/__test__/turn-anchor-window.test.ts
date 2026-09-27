import { describe, expect, test } from 'bun:test';

import { ANCHOR_WINDOW_RADIUS, turnAnchorWindow } from '../turn-anchor-window';
import type { TurnAnchorDatum } from '../turn-anchor-data';

/** 锚点带窗口（T55 用户裁决）：同屏最多 21 个刻痕 = 当前轮 ±10；两端钳制；短会话全量。 */
function anchorsOf(count: number): TurnAnchorDatum[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `t${i}`,
    time: `${i}`,
    summary: `第${i}轮`,
  }));
}

describe('turnAnchorWindow（锚点带刻痕窗口）', () => {
  test('50 条锚点在第 20 条（0 基 19）：恰好 21 个刻痕 = 前 10 + 当前 + 后 10', () => {
    const anchors = anchorsOf(50);
    const visible = turnAnchorWindow(anchors, 19);
    expect(visible).toHaveLength(21);
    expect(visible[0]?.id).toBe('t9');
    expect(visible[10]?.id).toBe('t19');
    expect(visible[20]?.id).toBe('t29');
  });

  test.each([0, 1, 3, 21])('总锚点 %i ≤ 21：全量展示（同一引用，不切片）', (count) => {
    const anchors = anchorsOf(count);
    expect(turnAnchorWindow(anchors, 0)).toBe(anchors);
  });

  test('首端钳制（用户裁决：不平移补足 21）：i=0 展示 t0..t10 共 11 个', () => {
    const visible = turnAnchorWindow(anchorsOf(50), 0);
    expect(visible).toHaveLength(11);
    expect(visible[0]?.id).toBe('t0');
    expect(visible[10]?.id).toBe('t10');
  });

  test('尾端钳制：i=49 展示 t39..t49 共 11 个', () => {
    const visible = turnAnchorWindow(anchorsOf(50), 49);
    expect(visible).toHaveLength(11);
    expect(visible[0]?.id).toBe('t39');
    expect(visible[10]?.id).toBe('t49');
  });

  test('前侧不足 10 条全部展示：i=3 展示 t0..t13 共 14 个', () => {
    const visible = turnAnchorWindow(anchorsOf(50), 3);
    expect(visible.map((anchor) => anchor.id)).toEqual(
      Array.from({ length: 14 }, (_, i) => `t${i}`),
    );
  });

  test('不变量：任意下标窗口恒 ≤ 2R+1 且恒含当前条', () => {
    const anchors = anchorsOf(100);
    for (let i = 0; i < anchors.length; i += 1) {
      const visible = turnAnchorWindow(anchors, i);
      expect(visible.length).toBeLessThanOrEqual(ANCHOR_WINDOW_RADIUS * 2 + 1);
      expect(visible.map((anchor) => anchor.id)).toContain(`t${i}`);
    }
  });

  test.each([
    ['NaN', Number.NaN, 0],
    ['负数', -5, 0],
    ['小数', 2.7, 2],
    ['超界', 999, 49],
  ] as const)('垃圾 currentIndex（%s）：钳制降级到等效下标 %i 的精确窗口', (_label, index, effective) => {
    const anchors = anchorsOf(50);
    const visible = turnAnchorWindow(anchors, index);
    const expected = turnAnchorWindow(anchors, effective);
    expect(visible.map((anchor) => anchor.id)).toEqual(expected.map((anchor) => anchor.id));
  });

  test('超大 currentIndex 钳到末条：窗口贴尾', () => {
    const visible = turnAnchorWindow(anchorsOf(50), 999);
    expect(visible[visible.length - 1]?.id).toBe('t49');
  });

  test('空锚点集返回空数组', () => {
    expect(turnAnchorWindow([], 0)).toEqual([]);
    expect(turnAnchorWindow([], Number.NaN)).toEqual([]);
  });
});
