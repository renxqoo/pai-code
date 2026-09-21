import type { InflightView } from '@paiapp/contracts';

/**
 * 直执行 bash 的收尾探测（T35 M2b）。
 *
 * 协议只推 `bash_execution_update` 增量、没有终态帧，而重载后的渲染层没有在途登记
 * （发包的 `session/bash` invoke 续体随旧渲染层消亡）——输出静默后用读口确认：读口说没有
 * 在途 bash 即已结束，熄灭横幅并拉一次转写把结果条目补上。仍在跑时有界重排（长静默命令
 * 也能收尾，且不无限轮询）。
 */

export const BASH_END_PROBE_DELAY_MS = 700;
export const BASH_END_PROBE_MAX_REARMS = 30;
/** 快频预算耗尽后的慢频兜底间隔：静默长命令（构建/安装类，分钟级）也要能收尾，
 * 慢频无重排上限（每线程恒至多一个定时器，成本有界）。 */
export const BASH_END_PROBE_SLOW_MS = 30_000;

export interface BashEndProbe {
  /** 排一次收尾探测（同线程重置旧句柄）。 */
  arm(threadId: string): void;
  /** 探测发现仍在跑：有界重排。 */
  rearm(threadId: string): void;
  clear(threadId: string): void;
  clearAll(): void;
}

export function createBashEndProbe(input: {
  probe: (threadId: string) => Promise<InflightView | null>;
  onSettled: (threadId: string) => void;
  onStillRunning: (threadId: string) => void;
  isDisposed: () => boolean;
  delayMs?: number;
  slowMs?: number;
}): BashEndProbe {
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  const rearms = new Map<string, number>();
  const delayMs = input.delayMs ?? BASH_END_PROBE_DELAY_MS;
  const slowMs = input.slowMs ?? BASH_END_PROBE_SLOW_MS;

  const clear = (threadId: string): void => {
    const pending = timers.get(threadId);
    if (pending !== undefined) clearTimeout(pending);
    timers.delete(threadId);
  };

  const schedule = (threadId: string, ms: number): void => {
    // 覆盖表项前清旧句柄：rearm 会在现行探测的定时器已到期、在途回包未落时再排
    // （arm 也会经 bashOutput 重触发）——不清则泄漏句柄照常到期，其回调里的
    // timers.delete 还会误删后挂的新句柄，级联使 clear() 失效
    const stale = timers.get(threadId);
    if (stale !== undefined) clearTimeout(stale);
    timers.set(
      threadId,
      setTimeout(() => {
        timers.delete(threadId);
        if (input.isDisposed()) return;
        void input
          .probe(threadId)
          .then((view) => {
            if (input.isDisposed()) return;
            if (view?.bash != null) {
              input.onStillRunning(threadId);
              return;
            }
            rearms.delete(threadId);
            input.onSettled(threadId);
          })
          .catch(() => undefined);
      }, ms),
    );
  };

  return {
    arm(threadId) {
      clear(threadId);
      rearms.set(threadId, 0);
      schedule(threadId, delayMs);
    },
    rearm(threadId) {
      const used = rearms.get(threadId) ?? 0;
      // 快频预算（~21s）耗尽后转慢频：横幅不再可能「静默结束而无人收尾」，
      // 且探测成本收敛到每线程每 30s 一次
      schedule(threadId, used >= BASH_END_PROBE_MAX_REARMS ? slowMs : delayMs);
      if (used < BASH_END_PROBE_MAX_REARMS) rearms.set(threadId, used + 1);
    },
    clear,
    clearAll() {
      for (const pending of timers.values()) clearTimeout(pending);
      timers.clear();
      rearms.clear();
    },
  };
}
