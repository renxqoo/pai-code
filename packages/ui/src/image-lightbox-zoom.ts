/**
 * 灯箱缩放/平移的纯函数层（无 React、无 DOM——坐标换算全在这里，组件只做事件采集）。
 *
 * 比例语义：ratio = 渲染尺寸 / 原图像素（1 = 原始大小，0.6 = 60%）。工具条百分比
 * 与用户心智对齐「这张图多大」，与视口 contain 的结果无关。
 *
 * 坐标系约定：变换以视口中心为原点（`translate(tx, ty)`）。图像按 natural×ratio
 * 直接布局，故缩放只改尺寸不改 scale——平移钳制与图像渲染尺寸无关容器，天然精确。
 * 视口内一点相对中心的偏移 a，屏幕位置 = a + t；锚点缩放保持 a 处图像点不动：
 * t' = a − (a − t)·(ratio' / ratio)。
 */

/** 比例上下限与初始档（10% / 60% / 800%）。 */
export const MIN_RATIO = 0.1;
export const INITIAL_RATIO = 0.6;
export const MAX_RATIO = 8;

/** 缩放变换态：相对原图的比例 + 平移（视口像素，中心原点）。 */
export type ZoomState = { ratio: number; tx: number; ty: number };

/** 初始态：60% 居中。 */
export const INITIAL_ZOOM: ZoomState = { ratio: INITIAL_RATIO, tx: 0, ty: 0 };

/** 钳制比例到 [MIN_RATIO, MAX_RATIO]。 */
export function clampRatio(ratio: number): number {
  return Math.min(MAX_RATIO, Math.max(MIN_RATIO, ratio));
}

/** 钳制比例后同步换算平移，保持锚点 a（相对中心的偏移）下的图像点不动；a 缺省 = 视口中心。 */
export function zoomAt(state: ZoomState, nextRatio: number, anchor?: { x: number; y: number }): ZoomState {
  const ratio = clampRatio(nextRatio);
  if (anchor === undefined) return { ratio, tx: 0, ty: 0 };
  const factor = ratio / state.ratio;
  return { ratio, tx: anchor.x - factor * (anchor.x - state.tx), ty: anchor.y - factor * (anchor.y - state.ty) };
}

/** 按钮/滚轮步进系数（每档 ×1.25，几何感均匀且可控）。 */
export const ZOOM_STEP_FACTOR = 1.25;

/** 原图 1:1 档：步进跨入 [1, 1×步进系数) 区间时吸附到 1（否则百分比永远落在 94% / 117% 之间，用户到不了「原大」）。 */
export const UNITY_RATIO = 1;

/**
 * 档位步进（吸附 1:1）：放大时若落进 [1, 1.25) 则停到 1；缩小时若落进 (0.8, 1] 则停到 1；
 * 其余档等比递增。吸附按「落点区间」判定而非「单步是否跨过」——从 0.6 放大一档到 0.75
 * 并不跨过 1，但下一档 0.94 再上一档 1.17 才跨，中间用户会先看到 0.94，
 * 若不做区间吸附就永远停不到 1。
 */
export function stepRatio(ratio: number, dir: 1 | -1): number {
  const candidate = ratio * Math.pow(ZOOM_STEP_FACTOR, dir);
  if (dir > 0 && candidate >= UNITY_RATIO && candidate < UNITY_RATIO * ZOOM_STEP_FACTOR) return UNITY_RATIO;
  if (dir < 0 && candidate < UNITY_RATIO && candidate > (UNITY_RATIO * ZOOM_STEP_FACTOR) ** -1) return UNITY_RATIO;
  return candidate;
}

/**
 * 平移钳制：图像边缘不得拖入视口内部——任一轴上「渲染尺寸 ≤ 视口」时锁中心（偏移归零），
 * 否则中心偏移限 |t| ≤ (渲染尺寸 − 视口) / 2（图像边缘最远贴视口边缘，始终可拖回）。
 * 渲染尺寸 = 原图像素 × ratio，故只需原图尺寸与视口尺寸（本层只算）。
 */
export function clampPan(state: ZoomState, natural: { width: number; height: number }, viewport: { width: number; height: number }): ZoomState {
  const limitFor = (imageSpan: number, viewportSpan: number): number => {
    const renderedSpan = imageSpan * state.ratio;
    if (renderedSpan <= viewportSpan || viewportSpan === 0) return 0;
    return (renderedSpan - viewportSpan) / 2;
  };
  // `+ 0` 归一化：钳制在零限位时 Math.max/min 会产出 -0，污染下游 toEqual/快照断言
  const clampAxis = (value: number, limit: number): number => Math.min(limit, Math.max(-limit, value)) + 0;
  return {
    ratio: state.ratio,
    tx: clampAxis(state.tx, limitFor(natural.width, viewport.width)),
    ty: clampAxis(state.ty, limitFor(natural.height, viewport.height)),
  };
}

/** 比例变化或视口尺寸变化后收敛平移（越界归位；小图自动锁中心）。 */
export function settleZoom(state: ZoomState, natural: { width: number; height: number }, viewport: { width: number; height: number }): ZoomState {
  return clampPan(state, natural, viewport);
}

/** 当前比例下是否存在可平移余量（任一轴渲染尺寸超出视口；决定拖拽手势与光标形态）。 */
export function hasPanRoom(state: ZoomState, natural: { width: number; height: number }, viewport: { width: number; height: number }): boolean {
  return natural.width * state.ratio > viewport.width || natural.height * state.ratio > viewport.height;
}