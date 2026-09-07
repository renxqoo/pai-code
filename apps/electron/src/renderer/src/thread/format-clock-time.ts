/** 轮次结束时刻展示：12 小时制 "10:46 AM"，分钟恒定两位。 */
export function formatClockTime(ms: number): string {
  if (!Number.isFinite(ms)) return '';
  const date = new Date(ms);
  const hours24 = date.getHours();
  let hours = hours24 % 12;
  if (hours === 0) hours = 12;
  const minutes = `${date.getMinutes()}`.padStart(2, '0');
  return `${hours}:${minutes} ${hours24 < 12 ? 'AM' : 'PM'}`;
}
