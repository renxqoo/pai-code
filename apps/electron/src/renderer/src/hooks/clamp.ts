/** 区间截断：小于下界取下界，大于上界取上界。 */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
