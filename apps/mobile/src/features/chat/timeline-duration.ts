export function formatTimelineDuration(durationMs: number): string {
  const safeDuration = Number.isFinite(durationMs) ? Math.max(0, durationMs) : 0;
  if (safeDuration < 1000) return `${Math.round(safeDuration)}ms`;
  return `${(safeDuration / 1000).toFixed(safeDuration < 10_000 ? 1 : 0)}s`;
}
