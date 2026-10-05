/**
 * 在途乐观回显登记（threadId 键控，**FIFO**）：submitDraft 插入 pending 气泡时入队，
 * 权威气泡到达时认领，投递失败时按 localId 精确出队回滚。
 *
 * 认领身份两域：
 * - inboxEntryId：hub 在受理 prompt 时物化的 `agent/inbox/spliced` insert 条目 id
 *   （主进程 queueChanged 事件带回，`bindEchoEntries` 在此登记 localId ↔ entryId）。
 *   权威 userMessage 帧的 claimedIds 按 id 精准配对——内核双队列认领序 ≠ 提交序
 *   （立即改向的较新条目可先物化），纯 FIFO 会错领别人的回显。
 * - 无 entryId（旧 hub 不回传 / 事件丢失）：FIFO 兜底按 userBlocks 数认领。
 */
export const pendingEchoes = new Map<string, Array<{ localId: string; text: string; entryId?: string }>>();

/** 回显 ↔ inbox 条目绑定（queueChanged 的 followUp/steering 条目到达时逐条登记）。
 *  按队列序配对：insert 到达序 = 提交序（hub 单连接串行受理 prompt）。 */
export function bindEchoEntries(threadId: string, entries: readonly { id: string; text: string }[]): void {
  const queue = pendingEchoes.get(threadId);
  if (queue === undefined) return;
  let cursor = 0;
  for (const entry of entries) {
    const slot = queue[cursor];
    if (slot === undefined) return;
    if (slot.entryId === undefined && slot.text === entry.text) {
      slot.entryId = entry.id;
      cursor += 1;
    }
  }
}

/** 权威用户气泡到达的回显认领（单一真相——onEvent 与测试共用）。
 *  配对序：claimedIds 精准配对（按 entryId 找回显）→ 配对落空（空闲发送 4ms 内
 *  insert→claim 完成，queueChanged 镜像来不及绑定——回显 entryId 缺席）退回
 *  FIFO 按块数认领。认领是排他的：首条收敛（reconcileEcho → msg-seq-<seq>），
 *  合并帧内其余条目的回显直接除名（文本已在合并气泡内，逐条 rename 会撞出同
 *  id 多条——孤儿回显即「同样的消息两条、重启即失」的症状根源）。 */
export function claimEchoes(
  store: {
    reconcileEcho: (threadId: string, localId: string, seq: number) => void;
    dropPendingMessage: (threadId: string, localId: string) => void;
  },
  threadId: string,
  seq: number,
  claimedIds: readonly string[] | undefined,
  userBlocks: number | undefined,
): void {
  const queue = pendingEchoes.get(threadId);
  if (queue === undefined || queue.length === 0) return;
  if (claimedIds !== undefined && claimedIds.length > 0) {
    let converged = false;
    for (const entryId of claimedIds) {
      const index = queue.findIndex((slot) => slot.entryId === entryId);
      if (index === -1) continue;
      const [slot] = queue.splice(index, 1);
      if (slot === undefined) continue;
      if (!converged) {
        store.reconcileEcho(threadId, slot.localId, seq);
        converged = true;
      } else {
        store.dropPendingMessage(threadId, slot.localId);
      }
    }
    if (converged) {
      if (queue.length === 0) pendingEchoes.delete(threadId);
      return;
    }
    // 配对全部落空：镜像未及绑定（空闲发送常态）——退回 FIFO 认领队首，
    // 本帧条目数（claimedIds 数）即认领名额。
  }
  const quota = Math.max(1, userBlocks ?? claimedIds?.length ?? 1);
  const [first, ...rest] = queue.splice(0, quota);
  if (first !== undefined) store.reconcileEcho(threadId, first.localId, seq);
  for (const extra of rest) store.dropPendingMessage(threadId, extra.localId);
  if (queue.length === 0) pendingEchoes.delete(threadId);
}
