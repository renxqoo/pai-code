import type { TurnAnchorDatum } from './turn-anchor-data';

/** 锚点带窗口半径：当前轮前后各保留的刻痕条数（窗口上限 2R+1 = 21）。 */
export const ANCHOR_WINDOW_RADIUS = 10;

/**
 * 锚点带滑动窗口（T55）：以当前阅读轮为中心取前后各 R 条，上限 2R+1 = 21 个刻痕。
 * 总锚点 ≤ 2R+1 时全量返回（同一引用，短会话不切片）；两端钳制（前侧不足补后侧不
 * 平移）——第 i 轮可见区间 [i-R, i+R] 与全集的交。currentIndex 越界钳入 [0, n-1]，
 * 非有限值降级 0；空输入返回空数组。输出顺序与输入一致（消息流序）。
 */
export function turnAnchorWindow(
  anchors: readonly TurnAnchorDatum[],
  currentIndex: number,
): readonly TurnAnchorDatum[] {
  const total = anchors.length;
  if (total <= ANCHOR_WINDOW_RADIUS * 2 + 1) return anchors;
  const index = Number.isFinite(currentIndex)
    ? Math.min(Math.max(Math.trunc(currentIndex), 0), total - 1)
    : 0;
  return anchors.slice(
    Math.max(0, index - ANCHOR_WINDOW_RADIUS),
    Math.min(total, index + ANCHOR_WINDOW_RADIUS + 1),
  );
}
