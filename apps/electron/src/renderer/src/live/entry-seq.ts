/**
 * 渲染身份 → WAL 数值 seq：气泡/轮次 id（`msg-<条目 id>` / `turn-<条目 id>`）剥前缀，
 * 再解条目 id `seq-<n>`。两条路径都要——事件帧气泡的 id 是 `msg-seq-<n>`（渲染侧加
 * `msg-`），对账载荷的 entryIds 也是渲染身份（hydrate-items）；轮次组是 `turn-seq-<n>`。
 * 非此形态（垃圾输入/未来 id 方案变化）返回 null，调用方按未知降级。
 */
export function entrySeqOf(id: string): number | null {
  const bare = id.startsWith('msg-') ? id.slice(4) : id.startsWith('turn-') ? id.slice(5) : id;
  const match = /^seq-(\d+)$/.exec(bare);
  if (match === null) return null;
  const seq = Number(match[1] ?? '');
  return Number.isSafeInteger(seq) && seq > 0 ? seq : null;
}
