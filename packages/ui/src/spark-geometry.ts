/** 品牌光刺（12 芒星）几何：24×24 视区内从 12 点方向逐 30° 生成射线，长短交替。 */
export const SPARK_RAY_COUNT = 12
const RAY_LONG = 10
const RAY_SHORT = 7.4
const RAY_INNER = 2.4
const CENTER = 12

type Point = { x: number; y: number }

/** 第 index 条射线的路径段：内圈起点到长短交替的端点。 */
export function sparkRayPath(index: number): string {
  const angle = (index * 360) / SPARK_RAY_COUNT - 90
  const outer = index % 2 === 0 ? RAY_LONG : RAY_SHORT
  const radians = (angle * Math.PI) / 180
  const inner: Point = {
    x: CENTER + RAY_INNER * Math.cos(radians),
    y: CENTER + RAY_INNER * Math.sin(radians),
  }
  const tip: Point = {
    x: CENTER + outer * Math.cos(radians),
    y: CENTER + outer * Math.sin(radians),
  }
  return `M${inner.x.toFixed(2)} ${inner.y.toFixed(2)}L${tip.x.toFixed(2)} ${tip.y.toFixed(2)}`
}

export const SPARK_RAYS: readonly string[] = Array.from({ length: SPARK_RAY_COUNT }, (_ray, index) =>
  sparkRayPath(index),
)
