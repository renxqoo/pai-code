import type { PendingImage } from '@/composer/read-image-file';

/**
 * 生成中排队消息的本地暂存域（设计稿「继续输入以排队后续修改」卡片堆）。
 *
 * hub 队列没有单条操作（协议仅 clear_queue），可编辑/可删除/可立即改向的
 * 排队 UX 只能落在发送前的渲染层：生成中回车先入本暂存，轮自然结束按序
 * followUp 冲刷；「立即」以 steer 即时投递。投递原子语义仍在 hub
 * （prompt+streamingBehavior：空闲=立即发送、流式=入队轮末自动消费）。
 *
 * 暂存按 threadId 寻址并记录会话文件路径（sessionPath）：重开/懒恢复/宿主
 * 重启会话换 id 时，按路径改绑到新线程（reattachByPath），用户排队的消息
 * 不随 id 更替丢失。
 */

export type QueuedDraftImages = readonly { name: string; payload: PendingImage }[];
export type QueuedDraft = { id: number; text: string; images: QueuedDraftImages };

/** 暂存投递；resolve null = 已发出（失败通知由提交实现负责）。 */
export type QueuedDraftSubmit = (threadId: string, draft: QueuedDraft, mode: 'steer' | 'followUp') => Promise<string | null>;

export type QueuedDrafts = {
  readonly snapshot: () => Readonly<Record<string, readonly QueuedDraft[]>>;
  readonly subscribe: (listener: () => void) => () => void;
  readonly stage: (threadId: string, sessionPath: string | null, text: string, images: QueuedDraftImages) => void;
  readonly remove: (threadId: string, id: number) => void;
  /** 取出（移除并返回）目标条目——编辑回填用；不存在返回 null。 */
  readonly take: (threadId: string, id: number) => QueuedDraft | null;
  /** 立即改向：先移除再以 steer 投递；失败回插原位（消息不丢）。 */
  readonly sendNow: (threadId: string, id: number, submit: QueuedDraftSubmit) => Promise<void>;
  /** 轮末冲刷：按序 followUp 投递，成功一条移除一条；失败即停，余量保留。 */
  readonly flush: (threadId: string, submit: QueuedDraftSubmit) => Promise<void>;
  /** 硬丢弃该线程暂存（用户显式关闭会话）。 */
  readonly dropThread: (threadId: string) => void;
  /** 线程暂存记录的会话路径（无暂存/未记录为 null）。 */
  readonly pathOf: (threadId: string) => string | null;
  /** 是否有线程（除 excludeId 外）持有该会话路径的暂存——重开换 id 后改绑判定。 */
  readonly hasPathHost: (sessionPath: string, excludeId: string) => boolean;
  /** 按会话路径把别线程的暂存并入 targetId（按全局自增 id 恢复时间序）；返回是否发生迁移。 */
  readonly reattachByPath: (sessionPath: string, targetId: string) => boolean;
};

const EMPTY: readonly QueuedDraft[] = [];

export function createQueuedDrafts(): QueuedDrafts {
  let byThread: Record<string, readonly QueuedDraft[]> = {};
  /** 线程 → 会话文件路径（stage 时记录；改绑时随暂存迁移）。 */
  let paths: Record<string, string | null> = {};
  let seq = 0;
  const listeners = new Set<() => void>();
  /** 每线程串行链：冲刷与立即改向同链执行，杜绝同一条消息双发。 */
  const chains = new Map<string, Promise<void>>();

  /** 提交新态：清空的线程键随手剪除（防改绑/移除后空键与路径残留）。 */
  const commit = (next: Record<string, readonly QueuedDraft[]>, nextPaths: Record<string, string | null>): void => {
    byThread = Object.fromEntries(Object.entries(next).filter(([, drafts]) => drafts.length > 0));
    paths = Object.fromEntries(Object.entries(nextPaths).filter(([key]) => byThread[key] !== undefined));
    for (const listener of listeners) listener();
  };
  const list = (threadId: string): readonly QueuedDraft[] => byThread[threadId] ?? EMPTY;

  const enqueue = (threadId: string, op: () => Promise<void>): Promise<void> => {
    const chained = (chains.get(threadId) ?? Promise.resolve()).then(op, op);
    const settled = chained.then(
      () => undefined,
      () => undefined,
    );
    chains.set(threadId, settled);
    void settled.then(() => {
      if (chains.get(threadId) === settled) chains.delete(threadId);
    });
    return chained;
  };
  /** IPC 桥异常不得击穿串行链或吞卡片：异常按投递失败处理（余量保留/回插）。 */
  const attempt = async (threadId: string, draft: QueuedDraft, mode: 'steer' | 'followUp', submit: QueuedDraftSubmit): Promise<string | null> => {
    try {
      return await submit(threadId, draft, mode);
    } catch {
      return 'submit_failed';
    }
  };

  const remove = (threadId: string, id: number): void => {
    const current = list(threadId);
    if (!current.some((entry) => entry.id === id)) return;
    commit({ ...byThread, [threadId]: current.filter((entry) => entry.id !== id) }, paths);
  };
  const insert = (threadId: string, index: number, draft: QueuedDraft): void => {
    const next = [...list(threadId)];
    next.splice(index, 0, draft);
    commit({ ...byThread, [threadId]: next }, paths);
  };
  const dropThread = (threadId: string): void => {
    if (byThread[threadId] === undefined) return;
    const next = Object.fromEntries(Object.entries(byThread).filter(([key]) => key !== threadId));
    const nextPaths = Object.fromEntries(Object.entries(paths).filter(([key]) => key !== threadId));
    commit(next, nextPaths);
  };

  return {
    snapshot: () => byThread,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    stage(threadId, sessionPath, text, images) {
      seq += 1;
      commit({ ...byThread, [threadId]: [...list(threadId), { id: seq, text, images }] }, { ...paths, [threadId]: sessionPath });
    },
    remove,
    take(threadId, id) {
      const found = list(threadId).find((entry) => entry.id === id);
      if (found === undefined) return null;
      remove(threadId, id);
      return found;
    },
    sendNow(threadId, id, submit) {
      return enqueue(threadId, async () => {
        const current = list(threadId);
        const index = current.findIndex((entry) => entry.id === id);
        const draft = current[index];
        if (index < 0 || draft === undefined) return;
        remove(threadId, id);
        const reason = await attempt(threadId, draft, 'steer', submit);
        if (reason !== null) insert(threadId, index, draft);
      });
    },
    flush(threadId, submit) {
      if (list(threadId).length === 0) return Promise.resolve();
      return enqueue(threadId, async () => {
        while (true) {
          const head = list(threadId)[0];
          if (head === undefined) return;
          const reason = await attempt(threadId, head, 'followUp', submit);
          if (reason !== null) return;
          // 按 id 移除刚发出的那条：提交在途时用户的编辑/移除可能已改变队头
          remove(threadId, head.id);
        }
      });
    },
    dropThread,
    pathOf: (threadId) => paths[threadId] ?? null,
    hasPathHost(sessionPath, excludeId) {
      for (const [threadId, path] of Object.entries(paths)) {
        if (threadId !== excludeId && path === sessionPath && list(threadId).length > 0) return true;
      }
      return false;
    },
    reattachByPath(sessionPath, targetId) {
      const moved: QueuedDraft[] = [];
      const next: Record<string, readonly QueuedDraft[]> = {};
      for (const [threadId, drafts] of Object.entries(byThread)) {
        if (threadId !== targetId && paths[threadId] === sessionPath && drafts.length > 0) {
          moved.push(...drafts);
          continue;
        }
        next[threadId] = drafts;
      }
      if (moved.length === 0) return false;
      // 整体按全局自增 id 排序：目标既有暂存与迁移来的暂存统一恢复时间序
      next[targetId] = [...list(targetId), ...moved].sort((a, b) => a.id - b.id);
      const nextPaths = Object.fromEntries(Object.entries(paths).filter(([key]) => next[key] !== undefined));
      nextPaths[targetId] = sessionPath;
      commit(next, nextPaths);
      return true;
    },
  };
}

/** 应用级单例：语言切换触发的根级重挂载不丢暂存（会话内暂存，不落盘——hub 无处托管编辑态）。 */
export const queuedDrafts = createQueuedDrafts();

export type ThreadRunState = { streaming: boolean; stopping: boolean; crashed: boolean; parked: boolean };

/** 线程运行面投影（订阅侦测用，只取结算判定字段）。 */
export function runStateOf(threads: Readonly<Record<string, ThreadRunState>>): Record<string, ThreadRunState> {
  const out: Record<string, ThreadRunState> = {};
  for (const [threadId, thread] of Object.entries(threads)) {
    out[threadId] = { streaming: thread.streaming, stopping: thread.stopping, crashed: thread.crashed, parked: thread.parked };
  }
  return out;
}

/**
 * 轮结束侦测：streaming true→false 的自然结算 → flush。
 * 不冲刷：用户停止意图（stopping，含 Esc/停止按钮/确认条——全部经 stopActiveTurn
 * 记录）、worker/宿主死亡（crashed）与 fork 换轨终态（parked，旧 id 已被 hub
 * 移除，投递必失败——卡片保留待按路径改绑）造成的结算——卡片保留由用户处置。
 * 线程离开 threads 且会话不复存在（sessionRemoved/reset）→ drop（是否真丢由
 * 调用方按会话路径宿主再判定——重开换 id 的间隙暂存须保留待改绑）。
 */
export function diffSettledThreads(
  prev: Readonly<Record<string, ThreadRunState>>,
  next: Readonly<Record<string, ThreadRunState>>,
  liveSessions: Readonly<Record<string, unknown>>,
): { flush: string[]; drop: string[] } {
  const flush: string[] = [];
  const drop: string[] = [];
  for (const [threadId, after] of Object.entries(next)) {
    const before = prev[threadId];
    if (before === undefined) continue;
    if (before.streaming && !after.streaming && !before.stopping && !after.crashed && !after.parked) flush.push(threadId);
  }
  for (const threadId of Object.keys(prev)) {
    if (next[threadId] === undefined && liveSessions[threadId] === undefined) drop.push(threadId);
  }
  return { flush, drop };
}
