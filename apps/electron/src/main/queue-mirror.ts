/**
 * hub 队列面镜像（agent/inbox/spliced → get_state → queueChanged）：
 * 结构信号只当触发器，文本快照与读命令同源。在途信号合并 + 拉取完成后按
 * dirty 位补拉一拍（在途快照已在 worker 侧定格，其后 append 的 splice 不在
 * 快照里——并发写不得因信号并入而丢）。失败恰一次重试（瞬态 busy/超时不丢
 * 队列面）。pending 标记的生命周期 = 拉取链完全终结——重试在飞期间标记保持，
 * 后续信号并入（不得提前释放，否则守卫失效起并发拉取，乱序回包会回退队列面）。
 */

export type QueueStateOutcome = { ok: true; data: unknown } | { ok: false };

export type QueueMirrorDeps = {
  fetchState: (threadId: string) => Promise<QueueStateOutcome>;
  emitQueue: (data: unknown, threadId: string) => void;
};

export function createQueueMirror(deps: QueueMirrorDeps): { signal: (threadId: string) => void } {
  /** 拉取链在途标记（守卫并发拉取）。 */
  const pending = new Set<string>();
  /** 在途期间并入的信号（快照后仍有写入的证据 → 拉取完成必须补拍）。 */
  const dirty = new Set<string>();

  const fetch = (threadId: string, retry: boolean): void => {
    void deps
      .fetchState(threadId)
      .then((outcome) => {
        if (outcome.ok) {
          deps.emitQueue(outcome.data, threadId);
          if (dirty.delete(threadId)) {
            fetch(threadId, false); // 在途期间有并发写：立即补拍（标记保持，守卫连续）
            return;
          }
          pending.delete(threadId);
          return;
        }
        if (!retry) {
          fetch(threadId, true); // 标记保持：重试链未终结，守卫连续
          return;
        }
        // 重试也败：悬挂至下一信号（下轮首拍 claim 必发信号自愈）
        pending.delete(threadId);
        dirty.delete(threadId);
      })
      .catch(() => {
        pending.delete(threadId);
        dirty.delete(threadId);
      });
  };

  return {
    signal(threadId: string): void {
      if (pending.has(threadId)) {
        dirty.add(threadId); // 在拉取中：快照已定格，本拍信号入 dirty 待补拍
        return;
      }
      pending.add(threadId);
      fetch(threadId, false);
    },
  };
}
