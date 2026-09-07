import type { UiEvent } from '@paiapp/contracts';

import type { BridgeClient } from './client-invoke';
import type { LiveStore } from './store';

/**
 * live 编排：事件订阅 → store 折叠；轮次边界的条目对账（真相源）；
 * 全部用户动作（发消息/停止/会话管理/对话框应答/模型切换）。
 *
 * 对账时序：turnStarted → 拉 entries（捕捉用户回显与通知注入）；
 * turnSettled → 再拉（以权威条目替换 live 轮次；失败则保留装饰态）。
 */

const RECONCILE_SETTLE_DELAY_MS = 120;

export interface LiveController {
  readonly start: () => Promise<void>;
  readonly dispose: () => void;
  readonly submitDraft: (threadId: string, message: string) => Promise<boolean>;
  readonly stopActiveTurn: (threadId: string) => Promise<void>;
  readonly createSession: (cwd: string) => Promise<boolean>;
  readonly openSavedSession: (sessionPath: string) => Promise<boolean>;
  readonly closeSession: (threadId: string) => Promise<void>;
  readonly renameSession: (threadId: string, name: string) => Promise<boolean>;
  readonly respondDialog: (requestId: string, payload: Record<string, unknown>) => Promise<void>;
  readonly cancelDialog: (requestId: string) => Promise<void>;
  readonly selectModel: (threadId: string, provider: string, modelId: string) => Promise<void>;
  readonly selectThinking: (threadId: string, level: string) => Promise<void>;
  readonly compact: (threadId: string) => Promise<void>;
  readonly refreshSaved: () => Promise<void>;
  readonly upsertProvider: (input: { name: string; baseUrl: string; api: string; models: string[]; apiKey?: string }) => Promise<boolean>;
  readonly removeProvider: (name: string) => Promise<boolean>;
  readonly refreshStats: (threadId: string) => Promise<void>;
  readonly ensureHydrated: (threadId: string) => Promise<void>;
}

export function createLiveController(client: BridgeClient, store: LiveStore): LiveController {
  let unsubscribe: (() => void) | null = null;
  let disposed = false;
  /** 对账在途标记（每线程一个），防止重复拉取。 */
  const reconciling = new Set<string>();

  const now = (): number => Date.now();

  const fetchEntries = async (threadId: string, since: string | null, dropLiveTurn: boolean): Promise<void> => {
    if (reconciling.has(`${threadId}:${dropLiveTurn}`)) return;
    reconciling.add(`${threadId}:${dropLiveTurn}`);
    try {
      const outcome = await client.invoke('session/entries', { threadId, since: since ?? undefined });
      if (disposed) return;
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

  const hydrateFull = async (threadId: string): Promise<void> => {
    const outcome = await client.invoke('session/entries', { threadId });
    if (disposed) return;
    if (!outcome.ok) {
      store.getState().hydrate(threadId, { kind: 'hydrate/failed' });
      return;
    }
    store.getState().hydrate(threadId, { kind: 'hydrate/initial', items: outcome.data.items, cursor: outcome.data.cursor });
  };

  const onEvent = (event: UiEvent): void => {
    const state = store.getState();
    state.applyEvent(event, now());
    if (event.type === 'turnStarted') {
      // 用户回显/通知注入经条目对账到达（消息不走事件流）
      void fetchEntries(event.threadId, state.threads[event.threadId]?.cursor ?? null, false).catch(() => undefined);
    } else if (event.type === 'turnSettled') {
      // 等条目落盘的短延迟后对账替换 live 轮次
      window.setTimeout(() => {
        if (disposed) return;
        const cursor = store.getState().threads[event.threadId]?.cursor ?? null;
        void fetchEntries(event.threadId, cursor, true).catch(() => undefined);
        void controller.refreshStats(event.threadId);
      }, RECONCILE_SETTLE_DELAY_MS);
    }
  };

  const controller: LiveController = {
    async start(): Promise<void> {
      unsubscribe = client.subscribe((raw) => {
      const parsed = parseEvent(raw);
      if (parsed !== null) onEvent(parsed);
    });
      const outcome = await client.invoke('app/bootstrap', {});
      if (disposed) return;
      if (!outcome.ok) {
        store.getState().bootstrapFailed(outcome.reason);
        return;
      }
      store.getState().bootstrap(outcome.data);
      const active = store.getState().activeThreadId;
      if (active !== null) await hydrateFull(active).catch(() => undefined);
    },
    dispose(): void {
      disposed = true;
      unsubscribe?.();
      unsubscribe = null;
    },
    async submitDraft(threadId: string, message: string): Promise<boolean> {
      const text = message.trim();
      if (text.length === 0) return false;
      const streaming = store.getState().threads[threadId]?.streaming ?? false;
      const outcome = streaming
        ? await client.invoke('session/followUp', { threadId, message: text })
        : await client.invoke('session/prompt', { threadId, message: text });
      return outcome.ok;
    },
    async stopActiveTurn(threadId: string): Promise<void> {
      store.getState().stopIntent(threadId);
      await client.invoke('session/abort', { threadId });
    },
    async createSession(cwd: string): Promise<boolean> {
      const outcome = await client.invoke('session/start', { cwd });
      if (!outcome.ok) return false;
      store.getState().setActiveThread(outcome.data.threadId);
      await hydrateFull(outcome.data.threadId).catch(() => undefined);
      return true;
    },
    async openSavedSession(sessionPath: string): Promise<boolean> {
      const outcome = await client.invoke('session/resume', { sessionPath });
      if (!outcome.ok) return false;
      store.getState().setActiveThread(outcome.data.threadId);
      await hydrateFull(outcome.data.threadId).catch(() => undefined);
      await this.refreshSaved();
      return true;
    },
    async closeSession(threadId: string): Promise<void> {
      await client.invoke('session/stop', { threadId });
    },
    async renameSession(threadId: string, name: string): Promise<boolean> {
      const outcome = await client.invoke('session/setName', { threadId, name });
      return outcome.ok;
    },
    async respondDialog(requestId: string, payload: Record<string, unknown>): Promise<void> {
      await client.invoke('dialog/respond', { requestId, payload });
    },
    async cancelDialog(requestId: string): Promise<void> {
      await client.invoke('dialog/respond', { requestId, payload: { cancelled: true } });
    },
    async selectModel(threadId: string, provider: string, modelId: string): Promise<void> {
      await client.invoke('session/setModel', { threadId, provider, modelId });
    },
    async selectThinking(threadId: string, level: string): Promise<void> {
      await client.invoke('session/setThinking', { threadId, level });
    },
    async compact(threadId: string): Promise<void> {
      await client.invoke('session/compact', { threadId });
    },
    async refreshSaved(): Promise<void> {
      const outcome = await client.invoke('session/listSaved', {});
      if (outcome.ok) {
        // saved 列表直接进 store（避免与 bootstrap 动作耦合）
        store.setState({ saved: outcome.data });
      }
    },
    async upsertProvider(input: { name: string; baseUrl: string; api: string; models: string[]; apiKey?: string }): Promise<boolean> {
      const outcome = await client.invoke('provider/upsert', input);
      if (!outcome.ok) return false;
      store.setState({ providers: outcome.data });
      const models = await client.invoke('model/list', {});
      if (models.ok) store.setState({ models: models.data });
      return true;
    },
    async removeProvider(name: string): Promise<boolean> {
      const outcome = await client.invoke('provider/remove', { name });
      if (!outcome.ok) return false;
      store.setState({ providers: outcome.data });
      const models = await client.invoke('model/list', {});
      if (models.ok) store.setState({ models: models.data });
      return true;
    },
    async refreshStats(threadId: string): Promise<void> {
      const outcome = await client.invoke('session/stats', { threadId });
      if (outcome.ok) {
        store.getState().updateStats(threadId, { contextUsage: outcome.data.contextUsage, tokensTotal: outcome.data.tokensTotal });
      }
    },
    async ensureHydrated(threadId: string): Promise<void> {
      const thread = store.getState().threads[threadId];
      if (thread !== undefined && thread.cursor !== null) return;
      await hydrateFull(threadId).catch(() => undefined);
    },
  };

  return controller;
}

/** 事件通道混有壳层消息（window-state 等）：非 UiEvent 形状静默丢弃。 */
function parseEvent(raw: unknown): UiEvent | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const type = (raw as { type?: unknown }).type;
  return typeof type === 'string' ? (raw as UiEvent) : null;
}
