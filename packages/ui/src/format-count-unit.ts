/**
 * 计数展示：千位以下原样，千位以上以 k 为单位保留一位小数并去掉无意义的 .0。
 * 同一形态同时服务 diff 增删行数与 token 合计（+34k / 1.4k / 196）。
 */
export function formatCountUnit(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '0';
  const rounded = Math.round(value);
  if (rounded < 1000) return `${rounded}`;
  const units = Math.round(rounded / 100) / 10;
  return `${units}k`;
}

/** Diff 增删量：模型只存量级，符号由字段语义决定（+34k / -16k）。 */
export function formatDiffDelta(kind: 'add' | 'del', value: number): string {
  const sign = kind === 'add' ? '+' : '-';
  return `${sign}${formatCountUnit(value)}`;
}

/** token 计数：尚无计量时输出占位符，由调用方决定展示形态。 */
export function formatTokenCount(value: number | null): string | null {
  if (value === null || !Number.isFinite(value)) return null;
  return formatCountUnit(value);
}
