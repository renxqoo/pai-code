import type { ImagePayload, PermissionRules, PreferencesView, UiEvent } from '@paiapp/contracts';

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
  /** 发送：成功返回 null，失败返回原因（调用方转用户可见提示）。mode 显式指定生成中投递方式。 */
  readonly submitDraft: (
    threadId: string,
    message: string,
    images?: readonly ImagePayload[],
    mode?: 'auto' | 'steer' | 'followUp',
  ) => Promise<string | null>;
  readonly stopActiveTurn: (threadId: string) => Promise<void>;
  readonly createSession: (cwd: string, model?: { provider: string; modelId: string }, trusted?: boolean) => Promise<boolean>;
  readonly openSavedSession: (sessionPath: string, trusted?: boolean) => Promise<boolean>;
  /** 会话信任切换 = stop(await) → 同文件 resume(trusted) → 激活新 threadId；stop 失败即中止不动原会话。 */
  readonly reloadSessionTrusted: (threadId: string, trusted: boolean) => Promise<boolean>;
  readonly closeSession: (threadId: string) => Promise<void>;
  readonly renameSession: (threadId: string, name: string) => Promise<boolean>;
  readonly respondDialog: (requestId: string, payload: Record<string, unknown>) => Promise<void>;
  readonly cancelDialog: (requestId: string) => Promise<void>;
  readonly selectModel: (threadId: string, provider: string, modelId: string) => Promise<void>;
  readonly selectThinking: (threadId: string, level: string) => Promise<void>;
  /** 压缩：成功返回 null，失败返回原因（调用方转用户可见提示）。 */
  readonly compact: (threadId: string) => Promise<string | null>;
  readonly refreshSaved: () => Promise<void>;
  /** 模型目录刷新（provider 保存触发 host 重启后向导/设置页手动补拉）。 */
  readonly refreshModels: () => Promise<void>;
  /** 全局权限规则读取（写入 agentDir/permission-rules.json 的视图；失败返回 null）。 */
  readonly refreshPermissionRules: () => Promise<PermissionRules | null>;
  /** 全局权限规则写入（原子写，hub 热读即时生效）；成功返回 null，失败返回原因。 */
  readonly writePermissionRules: (rules: PermissionRules) => Promise<string | null>;
  /** 会话级规则（sidecar）读取；source=thread 表示存在独立规则。 */
  readonly readSessionRules: (threadId: string) => Promise<{ rules: PermissionRules; source: 'thread' | 'global' } | null>;
  /** 会话级规则写入（null = 删除 sidecar 回退全局）；成功返回 null。 */
  readonly writeSessionRules: (threadId: string, rules: PermissionRules | null) => Promise<string | null>;
  /** 向运行中子代理注入 steer（非 running 一律失败，原因透传）。 */
  readonly steerSubagent: (threadId: string, subagentId: string, message: string) => Promise<string | null>;
  /** 运行时诊断（M1）。 */
  readonly fetchDiagnostics: () => Promise<{ hostPhase: 'starting' | 'ready' | 'restarting' | 'failed' | null; stderrTail: string; registrySessions: number } | null>;
  readonly restartHost: () => void;
  /** agent 定义目录刷新（带 threadId 时含受信可见的项目级；失败静默保持旧值）。 */
  readonly refreshAgents: (threadId: string | null) => Promise<void>;
  /** 项目文件搜索（@ 引用；cwd 门禁在主进程，失败返回 null）。 */
  readonly searchFiles: (cwd: string, query: string) => Promise<string[] | null>;
  /** hub 凭据目录刷新（auth/list，永不含 key 本身）。 */
  readonly refreshCredentials: () => Promise<void>;
  /** 写入官方 provider key（hub 侧 auth.json）；成功返回 null，失败返回原因。 */
  readonly setProviderKey: (provider: string, apiKey: string) => Promise<string | null>;
  /** 移除官方 provider key（OAuth 类凭据受 hub 保护拒绝）；成功返回 null。 */
  readonly removeProviderKey: (provider: string) => Promise<string | null>;
  readonly upsertProvider: (input: { name: string; baseUrl: string; api: string; models: string[]; apiKey?: string }) => Promise<boolean>;
  readonly removeProvider: (name: string) => Promise<boolean>;
  /** 应用偏好部分写（返回写后视图；失败返回 null，原因走通知条）。 */
  readonly updatePreferences: (patch: { defaultModel?: string | null; onboarded?: boolean; projectModels?: Record<string, string>; pinnedSessions?: string[]; trustedDefault?: boolean; hubDev?: { bunPath: string | null; hubEntry: string | null } }) => Promise<PreferencesView | null>;
  /** provider 连接探活（主进程直发；结果原样透传给调用方做内联展示）。 */
  readonly testProvider: (name: string) => Promise<{ ok: true; latencyMs: number } | { ok: false; reason: string }>;
  /** 直执行 bash（`!` 前缀）：成功返回 null；权威条目经对账进入对话流。 */
  readonly runBash: (threadId: string, command: string) => Promise<string | null>;
  readonly abortBash: (threadId: string) => Promise<void>;
  /** 清空排队消息（全清语义）。 */
  readonly clearQueue: (threadId: string) => Promise<void>;
  /** 在系统文件管理器中显示会话文件（主进程白名单校验）。 */
  readonly revealSession: (sessionPath: string) => Promise<void>;
  /** 从历史条目分叉（position=before）→ 激活新会话。 */
  readonly forkSession: (threadId: string, entryId: string) => Promise<boolean>;
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
      // 凭据目录随启动刷新（auth/list 轻量、失败静默——设置页有手动刷新兜底）
      void this.refreshCredentials();
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
    async submitDraft(
      threadId: string,
      message: string,
      images?: readonly ImagePayload[],
      mode: 'auto' | 'steer' | 'followUp' = 'auto',
    ): Promise<string | null> {
      const text = message.trim();
      if (text.length === 0) return 'empty_message';
      const payloads = images === undefined || images.length === 0 ? undefined : [...images];
      const withImages = payloads === undefined ? {} : { images: payloads };
      const streaming = store.getState().threads[threadId]?.streaming ?? false;
      // 生成中按显式模式投递（默认轮后排队）；非生成中一律走 prompt
      const send = streaming
        ? mode === 'steer'
          ? client.invoke('session/steer', { threadId, message: text, ...withImages })
          : client.invoke('session/followUp', { threadId, message: text, ...withImages })
        : client.invoke('session/prompt', { threadId, message: text, ...withImages });
      let outcome = await send;
      // TOCTOU 兜底：读取 streaming 与 invoke 之间轮次边界翻转时，按对侧路径回落一次
      if (!outcome.ok && !streaming && /stream/i.test(outcome.reason)) {
        outcome = await client.invoke('session/followUp', { threadId, message: text, ...withImages });
      }
      return outcome.ok ? null : outcome.reason;
    },
    async stopActiveTurn(threadId: string): Promise<void> {
      store.getState().stopIntent(threadId);
      await client.invoke('session/abort', { threadId });
    },
    async createSession(cwd: string, model?: { provider: string; modelId: string }, trusted?: boolean): Promise<boolean> {
      const outcome = await client.invoke('session/start', { cwd, provider: model?.provider, modelId: model?.modelId, trusted });
      if (!outcome.ok) return false;
      store.getState().setActiveThread(outcome.data.threadId);
      await hydrateFull(outcome.data.threadId).catch(() => undefined);
      return true;
    },
    async openSavedSession(sessionPath: string, trusted?: boolean): Promise<boolean> {
      const outcome = await client.invoke('session/resume', { sessionPath, trusted });
      if (!outcome.ok) return false;
      store.getState().setActiveThread(outcome.data.threadId);
      await hydrateFull(outcome.data.threadId).catch(() => undefined);
      await this.refreshSaved();
      return true;
    },
    async reloadSessionTrusted(threadId: string, trusted: boolean): Promise<boolean> {
      const sessionPath = store.getState().sessions[threadId]?.sessionPath ?? null;
      if (sessionPath === null || sessionPath.length === 0) return false;
      // 记住重开前是否活跃：resume 成功后仅在该会话原本活跃时跟随切换（用户在途切换别会话时不劫持）
      const wasActive = store.getState().activeThreadId === threadId;
      const stop = await client.invoke('session/stop', { threadId });
      if (!stop.ok) return false;
      const outcome = await client.invoke('session/resume', { sessionPath, trusted });
      if (!outcome.ok) {
        // 失败兜底：旧线程已被移除，刷新历史列表让会话可从 History 找回
        await this.refreshSaved();
        return false;
      }
      if (wasActive) store.getState().setActiveThread(outcome.data.threadId);
      await hydrateFull(outcome.data.threadId).catch(() => undefined);
      await this.refreshSaved();
      return true;
    },
    async closeSession(threadId: string): Promise<void> {
      await client.invoke('session/stop', { threadId });
    },
    async renameSession(threadId: string, name: string): Promise<boolean> {
      const trimmed = name.trim();
      if (trimmed.length === 0) return false;
      const outcome = await client.invoke('session/setName', { threadId, name: trimmed });
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
    async compact(threadId: string): Promise<string | null> {
      const outcome = await client.invoke('session/compact', { threadId });
      return outcome.ok ? null : outcome.reason;
    },
    async refreshSaved(): Promise<void> {
      const outcome = await client.invoke('session/listSaved', {});
      if (outcome.ok) {
        // saved 列表直接进 store（避免与 bootstrap 动作耦合）
        store.setState({ saved: outcome.data });
      }
    },
    async refreshModels(): Promise<void> {
      const outcome = await client.invoke('model/list', {});
      if (outcome.ok) store.setState({ models: outcome.data });
    },
    async refreshPermissionRules(): Promise<PermissionRules | null> {
      const outcome = await client.invoke('permission/read', {});
      if (!outcome.ok) return null;
      store.setState({ permissionRules: outcome.data });
      return outcome.data;
    },
    async writePermissionRules(rules: PermissionRules): Promise<string | null> {
      const outcome = await client.invoke('permission/write', { rules });
      if (!outcome.ok) return outcome.reason;
      store.setState({ permissionRules: outcome.data });
      return null;
    },
    async readSessionRules(threadId: string): Promise<{ rules: PermissionRules; source: 'thread' | 'global' } | null> {
      const outcome = await client.invoke('permission/sessionRead', { threadId });
      if (!outcome.ok) return null;
      store.setState({ sessionRules: outcome.data });
      return outcome.data;
    },
    async writeSessionRules(threadId: string, rules: PermissionRules | null): Promise<string | null> {
      const outcome = await client.invoke('permission/sessionWrite', { threadId, rules });
      return outcome.ok ? null : outcome.reason;
    },
    async fetchDiagnostics(): Promise<{ hostPhase: 'starting' | 'ready' | 'restarting' | 'failed' | null; stderrTail: string; registrySessions: number } | null> {
      const outcome = await client.invoke('app/diagnostics', {});
      return outcome.ok ? outcome.data : null;
    },
    restartHost(): void {
      void client.invoke('app/restartHost', {}).then(() => undefined);
    },
    async steerSubagent(threadId: string, subagentId: string, message: string): Promise<string | null> {
      const text = message.trim();
      if (text.length === 0) return 'empty_message';
      const outcome = await client.invoke('subagent/steer', { threadId, subagentId, message: text });
      return outcome.ok ? null : outcome.reason;
    },
    async refreshAgents(threadId: string | null): Promise<void> {
      const outcome = await client.invoke('agent/list', threadId === null ? {} : { threadId });
      if (!outcome.ok) return;
      // 判活：请求发出后会话已切换则丢弃（防陈旧目录覆盖新会话视角）
      if (threadId !== null && store.getState().activeThreadId !== threadId) return;
      store.setState({ agents: outcome.data });
    },
    async runBash(threadId: string, command: string): Promise<string | null> {
      const text = command.trim();
      if (text.length === 0) return 'empty_command';
      store.getState().bashStarted(threadId);
      const outcome = await client.invoke('session/bash', { threadId, command: text });
      store.getState().bashSettled(threadId);
      await rebuildFromTranscript(threadId).catch(() => undefined);
      return outcome.ok ? null : outcome.reason;
    },
    async abortBash(threadId: string): Promise<void> {
      await client.invoke('session/abortBash', { threadId });
    },
    async clearQueue(threadId: string): Promise<void> {
      await client.invoke('session/clearQueue', { threadId });
    },
    async revealSession(sessionPath: string): Promise<void> {
      await client.invoke('session/reveal', { sessionPath });
    },
    async forkSession(threadId: string, entryId: string): Promise<boolean> {
      const outcome = await client.invoke('session/fork', { threadId, entryId, position: 'before' });
      if (!outcome.ok) return false;
      store.getState().setActiveThread(outcome.data.threadId);
      await hydrateFull(outcome.data.threadId).catch(() => undefined);
      return true;
    },
    async searchFiles(cwd: string, query: string): Promise<string[] | null> {
      if (cwd.length === 0) return null;
      const outcome = await client.invoke('file/search', { cwd, query });
      return outcome.ok ? outcome.data : null;
    },
    async refreshCredentials(): Promise<void> {
      const outcome = await client.invoke('auth/list', {});
      if (outcome.ok) {
        store.setState({ credentials: outcome.data });
      }
    },
    async setProviderKey(provider: string, apiKey: string): Promise<string | null> {
      const outcome = await client.invoke('auth/setKey', { provider, apiKey });
      if (!outcome.ok) return outcome.reason;
      await this.refreshCredentials();
      return null;
    },
    async removeProviderKey(provider: string): Promise<string | null> {
      const outcome = await client.invoke('auth/removeKey', { provider });
      if (!outcome.ok) return outcome.reason;
      await this.refreshCredentials();
      return null;
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
    async updatePreferences(patch: { defaultModel?: string | null; onboarded?: boolean; projectModels?: Record<string, string>; pinnedSessions?: string[]; trustedDefault?: boolean; hubDev?: { bunPath: string | null; hubEntry: string | null } }): Promise<PreferencesView | null> {
      const outcome = await client.invoke('app/setPreference', patch);
      if (!outcome.ok) return null;
      store.setState({ preferences: outcome.data });
      return outcome.data;
    },
    async testProvider(name: string): Promise<{ ok: true; latencyMs: number } | { ok: false; reason: string }> {
      const outcome = await client.invoke('provider/test', { name });
      return outcome.ok ? { ok: true, latencyMs: outcome.data.latencyMs } : { ok: false, reason: outcome.reason };
    },
    async refreshStats(threadId: string): Promise<void> {
      const outcome = await client.invoke('session/stats', { threadId });
      if (outcome.ok) store.getState().updateStats(threadId, outcome.data);
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
