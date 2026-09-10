import type { BridgeClient } from './client-invoke';
import type { LiveStore } from './store';

/**
 * 会话条目水化的三条拉取路径（controller 内编排使用）：
 * reconcile 增量对账（在途按 thread 去重）、rebuild 轮末全量重建、initial 冷启动全量。
 * 失败一律标记 hydrate/failed（转写落盘后的重建窗口由调用方守卫）。
 */
export function createEntryHydration(input: {
  client: BridgeClient;
  store: LiveStore;
  reconciling: Set<string>;
  isDisposed: () => boolean;
}) {
  const { client, store, reconciling, isDisposed } = input;

  const fetchEntries = async (threadId: string, since: string | null, dropLiveTurn: boolean): Promise<void> => {
    if (reconciling.has(`${threadId}:${dropLiveTurn}`)) return;
    reconciling.add(`${threadId}:${dropLiveTurn}`);
    try {
      const outcome = await client.invoke('session/entries', { threadId, since: since ?? undefined });
      if (isDisposed()) return;
      if (!outcome.ok) {
        // 游标失效由主进程兜底全量重拉；此处失败则标记（settle 后保留装饰态）
        store.getState().hydrate(threadId, { kind: 'hydrate/failed' });
        return;
      }
      store.getState().hydrate(threadId, { kind: 'hydrate/reconcile', items: outcome.data.items, cursor: outcome.data.cursor, dropLiveTurn });
    } finally {
      reconciling.delete(`${threadId}:${dropLiveTurn}`);
    }
  };

  const rebuildFromTranscript = async (threadId: string): Promise<void> => {
    const outcome = await client.invoke('session/entries', { threadId });

    if (isDisposed()) return;
    if (!outcome.ok) {
      store.getState().hydrate(threadId, { kind: 'hydrate/failed' });
      return;
    }
    store.getState().hydrate(threadId, { kind: 'hydrate/rebuild', items: outcome.data.items, cursor: outcome.data.cursor });
  };

  const hydrateFull = async (threadId: string): Promise<void> => {
    const outcome = await client.invoke('session/entries', { threadId });
    if (isDisposed()) return;
    if (!outcome.ok) {
      store.getState().hydrate(threadId, { kind: 'hydrate/failed' });
      return;
    }
    store.getState().hydrate(threadId, { kind: 'hydrate/initial', items: outcome.data.items, cursor: outcome.data.cursor });
  };

  return { fetchEntries, rebuildFromTranscript, hydrateFull };
}
