import type { TurnAnchorDatum } from './turn-anchor-data';

/** 锚点带窗口半径：当前轮前后各保留的刻痕条数（窗口常量 2R+1 = 21）。 */
export const ANCHOR_WINDOW_RADIUS = 10;

/**
 * 锚点带滑动窗口（T55）：总锚点 > 2R+1 = 21 时窗口**恒 21 条**（用户裁决 2026-09-28）——
 * 以当前阅读轮为中心前后各 R 条；两端不足侧向另一侧平移补满（贴顶/贴尾同样 21 条），
 * 窗口起点 = clamp(i-R, 0, n-(2R+1))。总锚点 ≤21 全量返回（同一引用，短会话按具体
 * 数量全展示，不切片）。currentIndex 越界钳入 [0, n-1]，非有限值降级 0；空输入返回
 * 空数组。输出顺序与输入一致（消息流序）。
 */
export function turnAnchorWindow(
  anchors: readonly TurnAnchorDatum[],
  currentIndex: number,
): readonly TurnAnchorDatum[] {
  const total = anchors.length;
  const size = ANCHOR_WINDOW_RADIUS * 2 + 1;
  if (total <= size) return anchors;
  const index = Number.isFinite(currentIndex)
    ? Math.min(Math.max(Math.trunc(currentIndex), 0), total - 1)
    : 0;
  const start = Math.min(Math.max(index - ANCHOR_WINDOW_RADIUS, 0), total - size);
  return anchors.slice(start, start + size);
}
