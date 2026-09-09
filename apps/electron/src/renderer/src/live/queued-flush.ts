import { queuedDrafts, runStateOf, diffSettledThreads, type QueuedDraftSubmit } from '@/composer/queued-drafts';
import type { LiveStore } from './store';

/**
 * 暂存排队的轮末冲刷连接器：订阅 store 一个入口完成三件事——
 * 1) 自然结算（streaming true→false 且非 stopping/crashed）按序 followUp 冲刷；
 * 2) 会话消失丢弃暂存——仅未落盘会话（sessionPath 为 null，无处改绑）；
 *    已落盘会话的移除一律保留暂存等待 3 改绑（重开/懒恢复/宿主重启换 id 的
 *    间隙、乃至日后从 History 重开都会接续投递），用户显式关闭由 controller
 *    先行硬丢弃；
 * 3) 会话注册时按路径改绑别线程的暂存；改绑目标为空闲的 live 会话时立即
 *    接续投递（重开/懒恢复场景原轮已死，「轮后再发」的等待已结束）——
 *    parked 占位只改绑不投递（宿主重启回落 parked 的崩溃保留卡片仍由
 *    用户处置，待唤回 resume 换 live id 后才接续）。
 */
export function connectQueuedDraftFlush(store: LiveStore, submit: QueuedDraftSubmit): () => void {
  let prev = runStateOf(store.getState().threads);
  return store.subscribe((state) => {
    const next = runStateOf(state.threads);
    const { flush, drop } = diffSettledThreads(prev, next, state.sessions);
    prev = next;

    for (const session of Object.values(state.sessions)) {
      if (session.sessionPath === null) continue;
      if (!queuedDrafts.hasPathHost(session.sessionPath, session.threadId)) continue;
      const moved = queuedDrafts.reattachByPath(session.sessionPath, session.threadId);
      if (moved && session.state === 'live' && state.threads[session.threadId]?.streaming !== true) {
        void queuedDrafts.flush(session.threadId, submit);
      }
    }
    for (const threadId of flush) void queuedDrafts.flush(threadId, submit);
    for (const threadId of drop) {
      if (queuedDrafts.pathOf(threadId) === null) queuedDrafts.dropThread(threadId);
    }
  });
}
