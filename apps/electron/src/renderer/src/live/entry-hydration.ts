import type { BridgeClient } from './client-invoke';
import type { LiveStore } from './store';

/**
 * 会话条目水化的三条拉取路径（controller 内编排使用）：
 * reconcile 增量对账（在途按 thread 去重）、rebuild 轮末重建（since 缺省全量；
 * 传轮首游标即轮内窗口重建——根治配对丢失的语义不变，长会话不再每轮 O(全量)）、
 * initial 冷启动全量。失败一律标记 hydrate/failed（转写落盘后的重建窗口由调用方守卫）。
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

  const rebuildFromTranscript = async (threadId: string, since: string | null = null): Promise<void> => {
    const outcome = await client.invoke('session/entries', { threadId, since: since ?? undefined });

    if (isDisposed()) return;
    if (!outcome.ok) {
      store.getState().hydrate(threadId, { kind: 'hydrate/failed' });
      return;
    }
    // 折叠语义必须与载荷口径一致：全量拉取（since 空）→ 整表 rebuild；
    // 轮内窗口（since=轮首游标，只含本轮条目）→ reconcile+dropLiveTurn——保历史
    // 前缀、以权威转写替换本轮 span。窗口喂给整表 rebuild 会把历史全部塌缩成本轮。
    if (since === null) {
      store.getState().hydrate(threadId, { kind: 'hydrate/rebuild', items: outcome.data.items, cursor: outcome.data.cursor });
      return;
    }
    store.getState().hydrate(threadId, {
      kind: 'hydrate/reconcile',
      items: outcome.data.items,
      cursor: outcome.data.cursor,
      dropLiveTurn: true,
    });
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

/**
 * 只读水化链（T27/T28）：parked 会话先纳管（session/register，host 本地零 worker、
 * 幂等）再拉条目并补 model 元数据。纳管对 legacy（<v3）/超大/外部改写文件失败时
 * 回落 resume（唯一自愈路径：迁移文件/换行替换——写路径唤醒是必要代价）；
 * 文件缺失类失败交 hydrate/failed（可重试）面。在途按线程去重，force 供重试入口。
 */
export function createReadonlyHydration(input: {
  client: BridgeClient;
  store: LiveStore;
  resumeByPath: (sessionPath: string) => Promise<string | null>;
  activate: (threadId: string) => void;
  isDisposed: () => boolean;
}) {
  const { client, store, resumeByPath, activate, isDisposed } = input;
  const hydrating = new Map<string, Promise<void>>();

  /** 条目拉取：视图落在原 threadId（换轨后拉取目标为 resume 响应 id）。 */
  const pull = async (threadId: string, targetId: string): Promise<void> => {
    const outcome = await client.invoke('session/entries', { threadId: targetId });
    if (isDisposed()) return;
    if (!outcome.ok) {
      store.getState().hydrate(threadId, { kind: 'hydrate/failed' });
      return;
    }
    store.getState().hydrate(threadId, { kind: 'hydrate/initial', items: outcome.data.items, cursor: outcome.data.cursor });
  };

  const run = async (threadId: string): Promise<void> => {
    const session = store.getState().sessions[threadId];
    if (session?.sessionPath == null) return;
    // live/dead 会话的冷启动水化（渲染层重载后 store 全新）：事件流只推增量、
    // 不重放历史，条目只能全量拉补；拉取后增量事件按既有 reconcile 语义续上。
    // 不走纳管（表项已在 hub）；重复调用由 hydrated 标志去重
    if (session.state !== 'parked') {
      await pull(threadId, threadId);
      return;
    }
    const registered = await client.invoke('session/register', { sessionPath: session.sessionPath });
    if (isDisposed()) return;
    if (!registered.ok && /not readable|thread_id_mismatch/.test(registered.reason)) {
      const liveId = await resumeByPath(session.sessionPath);
      if (isDisposed()) return;
      if (liveId !== null) {
        if (liveId !== threadId && store.getState().activeThreadId === threadId) activate(liveId);
        await pull(threadId, liveId);
        return;
      }
      store.getState().hydrate(threadId, { kind: 'hydrate/failed' });
      return;
    }
    if (!registered.ok) {
      store.getState().hydrate(threadId, { kind: 'hydrate/failed' });
      return;
    }
    await pull(threadId, threadId);
    // 直读 get_state 补 model 元数据（主进程 touchSession 落视图 + 推送；
    // 失败静默——注册表 model 缺省时控件本地推导兜底）
    void client.invoke('session/state', { threadId }).catch(() => undefined);
  };

  return {
    ensureHydrated(threadId: string, options?: { force?: boolean }): Promise<void> {
      // hydrated 标志判定（空会话 cursor 恒 null，不能以 cursor 判，否则切回即
      // 重水化抹掉在途现场）；force 供重试入口越过守卫（hydrate/failed 不动 hydrated）
      if (!options?.force && store.getState().threads[threadId]?.hydrated) return Promise.resolve();
      const inFlight = hydrating.get(threadId);
      if (inFlight !== undefined) return inFlight;
      const started = run(threadId).finally(() => {
        if (hydrating.get(threadId) === started) hydrating.delete(threadId);
      });
      hydrating.set(threadId, started);
      return started;
    },
  };
}
