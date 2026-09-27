/**
 * 路径 → 文件名（展示用）：`apps/electron/src/…/tool-row.tsx` → `tool-row.tsx`。
 * 与 toolSummary 的路径归一同口径——文件 diff 的标题也只显文件名，不露目录层级。
 */
export function objectName(path: string): string {
  const clean = path.replace(/^["'`]+|["'`]+$/g, '');
  const segments = clean.split(/[\\/]/).filter((segment) => segment.length > 0);
  return segments.at(-1) ?? clean;
}
