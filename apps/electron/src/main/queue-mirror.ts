/**
 * hub 队列面镜像（agent/inbox/spliced → get_state → queueChanged）：
 * 结构信号只当触发器，文本快照与读命令同源。在途信号合并去抖（N 连 splice 一拉）
 * + 失败恰一次重试（瞬态 busy/超时不丢队列面）。pending 标记的生命周期 = 拉取链
 * 完全终结——重试在飞期间标记保持，后续信号并入（不得提前释放，否则守卫失效
 * 起并发拉取，乱序回包会回退队列面）。
 */

export type QueueStateOutcome = { ok: true; data: unknown } | { ok: false };

export type QueueMirrorDeps = {
  fetchState: (threadId: string) => Promise<QueueStateOutcome>;
  emitQueue: (data: unknown, threadId: string) => void;
};

export function createQueueMirror(deps: QueueMirrorDeps): { signal: (threadId: string) => void } {
  const pending = new Set<string>();

  const fetch = (threadId: string, retry: boolean): void => {
    void deps
      .fetchState(threadId)
      .then((outcome) => {
        if (outcome.ok) {
          deps.emitQueue(outcome.data, threadId);
          pending.delete(threadId);
          return;
        }
        if (!retry) {
          fetch(threadId, true); // 标记保持：重试链未终结，守卫连续
          return;
        }
        pending.delete(threadId); // 重试也败：悬挂至下一信号（下轮首拍 claim 必发信号自愈）
      })
      .catch(() => {
        pending.delete(threadId);
      });
  };

  return {
    signal(threadId: string): void {
      if (pending.has(threadId)) return; // 在拉取中：本拍信号并入下一次拉取的结果
      pending.add(threadId);
      fetch(threadId, false);
    },
  };
}
