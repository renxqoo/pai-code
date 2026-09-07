const SECOND = 1000;
const MINUTE = 60 * SECOND;

/**
 * 计时展示：秒 <60 显 "Xs"，≥60 显 "Xm Ys"。
 * 非有限值与负值（时钟回拨、垃圾输入）一律降级为 "0s"，不输出负数。
 */
export function formatElapsed(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '0s';
  const totalSeconds = Math.floor(ms / SECOND);
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(ms / MINUTE);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${seconds}s`;
}
