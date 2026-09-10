import type { BridgeClient } from './client-invoke';
import type { LiveStore } from './store';

/**
 * 懒恢复机制（T16 建立、T27 收窄为「写路径专用」）：parked 占位 →
 * session/resume 的按需通路。读路径（浏览历史）经 host 直读不再唤醒
 * worker，只有发消息/写动作经 ensureLiveSession 兜底唤醒。
 * 单一职责文件：在途去重（waking）、乐观登记（resumedByPath）只在这里。
 */

export interface LazyResume {
  /** 按 sessionPath 恢复（在途去重；trusted 分歧串行结算后重发，不静默降级信任态）。 */
  readonly resumeByPath: (sessionPath: string, trusted?: boolean) => Promise<string | null>;
  /** parked 占位 → 恢复返回可用 threadId；非 parked 原样返回（dead 由 hub 写命令自愈）；失败 null。 */
  readonly ensureLiveSession: (threadId: string) => Promise<string | null>;
  /** 显式激活会话（只读激活同一入口；唤醒换 id 的激活由 submitDraft 处理）。 */
  readonly activate: (threadId: string) => void;
  /** host 进程消亡：乐观登记的「已恢复」随 worker 全灭失效。 */
  readonly invalidate: () => void;
  /** 会话线程被 stop 后清该路径的乐观登记（线程已 dispose，旧 id 不再可用）。 */
  readonly discardResumed: (sessionPath: string) => void;
}

export function createLazyResume(client: BridgeClient, store: LiveStore): LazyResume {
  /** 在途登记：sessionPath -> resume（hub 对同文件重复 resume 回 failure，必须去重）。 */
  const waking = new Map<string, { promise: Promise<string | null>; trusted: boolean | undefined }>();

  /**
   * 乐观登记：sessionPath -> 已恢复 threadId。resume 响应可能先于
   * sessionUpdated(live) 事件到达（跨 IPC 通道乱序），此窗口内重复使用按已恢复处理。
   */
  const resumedByPath = new Map<string, string>();

  const attemptResume = (sessionPath: string, trusted?: boolean): Promise<string | null> => {
    const promise = client
      .invoke('session/resume', { sessionPath, trusted })
      .then((outcome) => {
        if (!outcome.ok) return null;
        resumedByPath.set(sessionPath, outcome.data.threadId);
        return outcome.data.threadId;
      })
      .catch(() => null)
      .finally(() => {
        // 只清自己的登记：参数分歧的后续 attempt 已覆盖同 key
        const entry = waking.get(sessionPath);
        if (entry?.promise === promise) waking.delete(sessionPath);
      });
    waking.set(sessionPath, { promise, trusted });
    return promise;
  };

  const resumeByPath = (sessionPath: string, trusted?: boolean): Promise<string | null> => {
    const pending = waking.get(sessionPath);
    if (pending === undefined) return attemptResume(sessionPath, trusted);
    if (pending.trusted === trusted) return pending.promise;
    return pending.promise
      .catch(() => undefined)
      .then(() => waking.get(sessionPath)?.promise ?? attemptResume(sessionPath, trusted));
  };

  const ensureLiveSession = async (threadId: string): Promise<string | null> => {
    const session = store.getState().sessions[threadId];
    // 未知 id：原样返回，交下游命令暴露真实错误；live/dead：hub 侧自愈（dead 下条命令自动恢复）
    if (session?.state !== 'parked') return threadId;
    if (session.sessionPath === null) return null;
    const resumed = resumedByPath.get(session.sessionPath);
    if (resumed !== undefined) return resumed;
    return resumeByPath(session.sessionPath);
  };

  const activate = (threadId: string): void => {
    store.getState().setActiveThread(threadId);
  };

  return {
    resumeByPath,
    ensureLiveSession,
    activate,
    invalidate: () => {
      resumedByPath.clear();
    },
    discardResumed: (sessionPath: string) => {
      resumedByPath.delete(sessionPath);
    },
  };
}
