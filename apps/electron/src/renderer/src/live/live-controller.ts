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
const DIALOG_AUTO_DISMISS_MS = 5 * 60 * 1_000;

export interface LiveController {
  readonly start: () => Promise<void>;
  readonly dispose: () => void;
  /** 发送：成功返回 null，失败返回原因（调用方转用户可见提示）。 */
  readonly submitDraft: (threadId: string, message: string) => Promise<string | null>;
  readonly stopActiveTurn: (threadId: string) => Promise<void>;
  readonly createSession: (cwd: string, model?: { provider: string; modelId: string }) => Promise<boolean>;
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
  let disposed = true;
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

  const rebuildFromTranscript = async (threadId: string): Promise<void> => {
    const outcome = await client.invoke('session/entries', { threadId });
    if (disposed) return;
    if (!outcome.ok) {
      store.getState().hydrate(threadId, { kind: 'hydrate/failed' });
      return;
    }
    store.getState().hydrate(threadId, { kind: 'hydrate/rebuild', items: outcome.data.items, cursor: outcome.data.cursor });
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

  /** 对话框兜底定时器登记：结算/dispose 时清理，避免滞留句柄。 */
  const dialogTimers = new Map<string, ReturnType<typeof setTimeout>>();

  /** 对话框本地结算：ui_response 只有 ack 无事件回执，宿主侧超时/未知 id 均静默——弹窗关闭由客户端自治。 */
  const settleDialog = (requestId: string): void => {
    const timer = dialogTimers.get(requestId);
    if (timer !== undefined) {
      clearTimeout(timer);
      dialogTimers.delete(requestId);
    }
    store.getState().applyEvent({ type: 'dialogSettled', requestId }, Date.now());
  };

  const onEvent = (event: UiEvent): void => {
    const state = store.getState();
    state.applyEvent(event, now());
    if (event.type === 'dialogRequest' && event.method !== 'notify' && event.method !== 'setStatus') {
      // 宿主侧 5 分钟超时默认拒绝后无回执帧：客户端同步兜底收起
      dialogTimers.set(
        event.requestId,
        setTimeout(() => {
          dialogTimers.delete(event.requestId);
          const stillPending = event.requestId in store.getState().dialogs;
          if (stillPending) void controller.cancelDialog(event.requestId);
        }, DIALOG_AUTO_DISMISS_MS),
      );
      return;
    }
    if (event.type === 'turnStarted') {
      // 用户回显/通知注入经条目对账到达（消息不走事件流）
      void fetchEntries(event.threadId, state.threads[event.threadId]?.cursor ?? null, false).catch(() => undefined);
    } else if (event.type === 'turnSettled') {
      // 等条目落盘的短延迟后【全量重建】：以完整转写替换轮次区域，
      // 根治增量批次切在 assistant/toolResult 之间导致的配对丢失。
      // 代际守卫：窗口内若新一轮已开始（followUp 自动续轮），本次重建让位给下一轮的 settle。
      const settledTurnId = state.threads[event.threadId]?.liveTurnId ?? null;
      setTimeout(() => {
        if (disposed) return;
        const current = store.getState().threads[event.threadId];
        if (current !== undefined && current.liveTurnId !== settledTurnId) return;
        void rebuildFromTranscript(event.threadId).catch(() => undefined);
        void controller.refreshStats(event.threadId);
      }, RECONCILE_SETTLE_DELAY_MS);
    }
  };

  const controller: LiveController = {
    async start(): Promise<void> {
      // 可重入：StrictMode/HMR 的双挂载会先 dispose 再 start；复原 disposed、
      // 订阅以 unsubscribe 为准只建一次，bootstrap 每次刷新（幂等快照替换）。
      disposed = false;
      unsubscribe ??= client.subscribe((raw) => {
        const parsed = parseEvent(raw);
        if (parsed !== null) onEvent(parsed);
      });
      let outcome: Awaited<ReturnType<typeof client.invoke<'app/bootstrap'>>> | null = null;
      try {
        outcome = await client.invoke('app/bootstrap', {});
      } catch {
        outcome = { ok: false, reason: 'bootstrap_crashed' };
      }
      if (disposed) return;
      if (outcome !== null && !outcome.ok) {
        store.getState().bootstrapFailed(outcome.reason);
        return;
      }
      if (outcome === null) return;
      store.getState().bootstrap(outcome.data);
      const active = store.getState().activeThreadId;
      if (active !== null) await hydrateFull(active).catch(() => undefined);
    },
    dispose(): void {
      disposed = true;
      for (const timer of dialogTimers.values()) clearTimeout(timer);
      dialogTimers.clear();
      unsubscribe?.();
      unsubscribe = null;
    },
    async submitDraft(threadId: string, message: string): Promise<string | null> {
      const text = message.trim();
      if (text.length === 0) return 'empty_message';
      const streaming = store.getState().threads[threadId]?.streaming ?? false;
      let outcome = streaming
        ? await client.invoke('session/followUp', { threadId, message: text })
        : await client.invoke('session/prompt', { threadId, message: text });
      // TOCTOU 兜底：读取 streaming 与 invoke 之间轮次边界翻转时，按对侧路径回落一次
      if (!outcome.ok && !streaming && /stream/i.test(outcome.reason)) {
        outcome = await client.invoke('session/followUp', { threadId, message: text });
      }
      return outcome.ok ? null : outcome.reason;
    },
    async stopActiveTurn(threadId: string): Promise<void> {
      store.getState().stopIntent(threadId);
      await client.invoke('session/abort', { threadId });
    },
    async createSession(cwd: string, model?: { provider: string; modelId: string }): Promise<boolean> {
      const outcome = await client.invoke('session/start', { cwd, provider: model?.provider, modelId: model?.modelId });
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
      settleDialog(requestId);
      await client.invoke('dialog/respond', { requestId, payload }).catch(() => undefined);
    },
    async cancelDialog(requestId: string): Promise<void> {
      settleDialog(requestId);
      await client.invoke('dialog/respond', { requestId, payload: { cancelled: true } }).catch(() => undefined);
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
        const stats = outcome.data as { contextUsage?: number | null; tokensTotal?: number } | null;
        store.getState().updateStats(threadId, {
          contextUsage: typeof stats?.contextUsage === 'number' ? stats.contextUsage : null,
          tokensTotal: typeof stats?.tokensTotal === 'number' ? stats.tokensTotal : 0,
        });
      }
    },
    async ensureHydrated(threadId: string): Promise<void> {
      const thread = store.getState().threads[threadId];
      // hydrated 标志判定（空会话 cursor 恒 null，不能以 cursor 判，否则切回即重水化抹掉在途现场）
      if (thread?.hydrated) return;
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
