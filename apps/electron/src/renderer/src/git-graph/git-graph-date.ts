/**
 * 图谱日期列文案：epoch 秒 → 'MM/DD HH:mm'（本地时区）。
 */
export function formatGitGraphDate(epochSeconds: number): string {
  const date = new Date(epochSeconds * 1000);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hour = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');
  return `${month}/${day} ${hour}:${minute}`;
}
