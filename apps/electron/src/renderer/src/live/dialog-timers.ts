/**
 * 对话框兜底定时器登记（属主线程随行回收）：宿主侧超时默认拒绝后无回执帧，
 * 客户端按固定时限同步兜底收起（超时回调自行复查 stillPending，弹窗已结算则
 * no-op）。同 id 重投先清旧句柄；线程消亡/宿主消亡/控制器销毁三条路径随行回收。
 */
export const DIALOG_AUTO_DISMISS_MS = 5 * 60 * 1_000;

export type DialogTimers = ReturnType<typeof createDialogTimers>;

export function createDialogTimers(autoDismissMs: number = DIALOG_AUTO_DISMISS_MS) {
  const timers = new Map<string, { threadId: string; handle: ReturnType<typeof setTimeout> }>();

  return {
    /** 新请求登记兜底（同 id 重投先清旧句柄——孤儿定时器会按首个请求的时点提前取消重投后的弹窗） */
    arm(requestId: string, threadId: string, onTimeout: () => void): void {
      const stale = timers.get(requestId);
      if (stale !== undefined) clearTimeout(stale.handle);
      timers.set(requestId, {
        threadId,
        handle: setTimeout(() => {
          timers.delete(requestId);
          onTimeout();
        }, autoDismissMs),
      });
    },
    /** 本地结算（应答/取消）回收句柄 */
    settle(requestId: string): void {
      const entry = timers.get(requestId);
      if (entry === undefined) return;
      clearTimeout(entry.handle);
      timers.delete(requestId);
    },
    /** 线程消亡：该线程挂起弹窗已被 store 折叠收走，句柄只会发出注定无回执的兜底取消 */
    dropThread(threadId: string): void {
      for (const [requestId, entry] of timers) {
        if (entry.threadId !== threadId) continue;
        clearTimeout(entry.handle);
        timers.delete(requestId);
      }
    },
    /** 宿主消亡/控制器销毁：全量回收（与 dispose 同口径） */
    clearAll(): void {
      for (const entry of timers.values()) clearTimeout(entry.handle);
      timers.clear();
    },
  };
}
