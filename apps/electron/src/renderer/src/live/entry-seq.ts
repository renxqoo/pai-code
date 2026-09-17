/**
 * HistoryItem id（`seq-<n>`，adapter 自 WAL 行号派生）→ 数值 seq。
 * fork 入参（session/fork 的 seq）与轮边界比较（turnStartSeq 同域）共用这一解析；
 * 非 `seq-` 形态（垃圾输入/未来 id 方案变化）返回 null，调用方按未知降级。
 */
export function entrySeqOf(id: string): number | null {
  const match = /^seq-(\d+)$/.exec(id);
  if (match === null) return null;
  const seq = Number(match[1] ?? '');
  return Number.isSafeInteger(seq) && seq > 0 ? seq : null;
}
