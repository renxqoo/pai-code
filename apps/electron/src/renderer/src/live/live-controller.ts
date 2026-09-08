import type { ImagePayload, PermissionRules, PreferencesView, ProviderModel, SkillView, ThinkingFormat, UiEvent } from '@paiapp/contracts';

import { copy } from '@/strings';
import type { BridgeClient } from './client-invoke';
import { coalesceEvents } from './coalesce-events';
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
  /** 会话选择：parked 占位走懒恢复（成功后以响应 id 激活，失败通知不自动重试）；其余直接激活。 */
  readonly selectSession: (threadId: string) => void;
  readonly stopActiveTurn: (threadId: string) => Promise<void>;
  readonly createSession: (cwd: string, model?: { provider: string; modelId: string }, trusted?: boolean) => Promise<string | null>;
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
  /** 全局权限规则读取（agentDir/permission-rules.json 视图；成功后同步刷新活跃会话生效视图；失败返回 null）。 */
  readonly refreshPermissionRules: () => Promise<PermissionRules | null>;
  /** 全局权限规则写入（原子写，hub 热读即时生效；成功后同步刷新活跃会话生效视图）；成功返回 null，失败返回原因。 */
  readonly writePermissionRules: (rules: PermissionRules) => Promise<string | null>;
  /** 向运行中子代理注入 steer（非 running 一律失败，原因透传）。 */
  readonly steerSubagent: (threadId: string, subagentId: string, message: string) => Promise<string | null>;
  /** 会话级规则（sidecar）读取；source=thread 表示存在独立规则。 */
  readonly readSessionRules: (threadId: string) => Promise<{ rules: PermissionRules; source: 'thread' | 'global' } | null>;
  /** 会话级规则写入（null = 删除 sidecar 回退全局）；成功返回 null。 */
  readonly writeSessionRules: (threadId: string, rules: PermissionRules | null) => Promise<string | null>;
  /** 运行时诊断（M1）。 */
  readonly fetchDiagnostics: () => Promise<{ hostPhase: 'starting' | 'ready' | 'restarting' | 'failed' | null; stderrTail: string; registrySessions: number } | null>;
  readonly restartHost: () => void;
  /** agent 定义目录刷新（带 threadId 时含受信可见的项目级；失败静默保持旧值）。 */
  readonly refreshAgents: (threadId: string | null) => Promise<void>;
  /** 用户级技能目录刷新（含启用态）。 */
  readonly refreshSkills: () => Promise<void>;
  /** 技能启停：写 pi settings skills overrides；返回写后清单（失败 null + 原因）。 */
  readonly setSkillEnabled: (name: string, enabled: boolean) => Promise<{ ok: true; data: SkillView[] } | { ok: false; reason: string }>;
  /** 技能开关完整编排：写 + 串行重开全部 live 会话（链式排队，交错不叠加）；失败返回重开失败数。 */
  readonly applySkillToggle: (name: string, enabled: boolean) => Promise<{ ok: true; reopenFailures: number } | { ok: false; reason: string }>;
  /** 同文件重开会话（不指定 trusted，保持既有信任态）：技能/资源开关生效通路。 */
  readonly reopenSession: (threadId: string) => Promise<boolean>;
  /** 项目文件搜索（@ 引用；cwd 门禁在主进程，失败返回 null）。 */
  readonly searchFiles: (cwd: string, query: string) => Promise<string[] | null>;
  /** hub 凭据目录刷新（auth/list，永不含 key 本身）。 */
  readonly refreshCredentials: () => Promise<void>;
  /** 写入官方 provider key（hub 侧 auth.json）；成功返回 null，失败返回原因。 */
  readonly setProviderKey: (provider: string, apiKey: string) => Promise<string | null>;
  /** 移除官方 provider key（OAuth 类凭据受 hub 保护拒绝）；成功返回 null。 */
  readonly removeProviderKey: (provider: string) => Promise<string | null>;
  readonly upsertProvider: (input: { name: string; baseUrl: string; api: string; models: ProviderModel[]; thinkingFormat?: ThinkingFormat; apiKey?: string }) => Promise<boolean>;
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
  /** 从历史条目分叉（position=before）→ 激活新会话；返回新 threadId（失败 null）。 */
  readonly forkSession: (threadId: string, entryId: string) => Promise<string | null>;
  readonly refreshStats: (threadId: string) => Promise<void>;
  readonly ensureHydrated: (threadId: string) => Promise<void>;
  /** 懒恢复（T16）：parked 占位 → session/resume（在途按 sessionPath 去重）。
   * 返回可用 threadId（非 parked 原样返回；失败 null，不自动重试）。 */
  readonly ensureLiveSession: (threadId: string) => Promise<string | null>;
  /** 懒恢复并激活（选择/兜底通路编排）：失败发通知条。 */
  readonly wakeAndActivate: (threadId: string) => void;
}

export function createLiveController(client: BridgeClient, store: LiveStore): LiveController {
  let unsubscribe: (() => void) | null = null;
  let disposed = true;
  /** 技能开关编排链（串行化，防多次开关的重开循环交错） */
  let skillToggleChain: Promise<void> = Promise.resolve();
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

  /** 懒恢复登记：sessionPath -> 在途 resume（hub 对同文件重复 resume 回 failure，必须去重）。 */
  const waking = new Map<string, Promise<string | null>>();

  const resumeByPath = (sessionPath: string, trusted?: boolean): Promise<string | null> => {
    const pending = waking.get(sessionPath);
    if (pending !== undefined) return pending;
    const attempt = client
      .invoke('session/resume', { sessionPath, trusted })
      .then((outcome) => (outcome.ok ? outcome.data.threadId : null))
      .catch(() => null)
      .finally(() => {
        waking.delete(sessionPath);
      });
    waking.set(sessionPath, attempt);
    return attempt;
  };

  const ensureLiveSession = async (threadId: string): Promise<string | null> => {
    const session = store.getState().sessions[threadId];
    // 未知 id：原样返回，交下游命令暴露真实错误；live/dead：hub 侧自愈（dead 下条命令自动恢复）
    if (session?.state !== 'parked') return threadId;
    if (session.sessionPath === null) return null;
    return resumeByPath(session.sessionPath);
  };

  const wakeAndActivate = (threadId: string): void => {
    void ensureLiveSession(threadId).then((liveId) => {
      if (disposed) return;
      if (liveId === null) {
        store.getState().pushNotice(copy.flow.resumeFailed);
        return;
      }
      store.getState().setActiveThread(liveId);
    });
  };

  /** 对话框兜底定时器登记：结算/dispose 时清理，避免滞留句柄。 */
  const dialogTimers = new Map<string, ReturnType<typeof setTimeout>>();

  /** 全局规则真相更新后刷新活跃会话的生效视图（source=global 时 rules 即全局内容，不得滞留旧值）。 */
  const refreshActiveSessionRules = async (): Promise<void> => {
    const active = store.getState().activeThreadId;
    if (active === null) return;
    await controller.readSessionRules(active).catch(() => undefined);
  };

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
    if (event.type === 'sessionUpdated' && event.session.state === 'parked' && state.activeThreadId === event.session.threadId) {
      // host 重启后对账回落 parked 的活跃会话：窗口正在看着它，自动唤回
      wakeAndActivate(event.session.threadId);
      return;
    }
    if (event.type === 'dialogRequest' && event.method !== 'notify' && event.method !== 'setStatus') {
      // 宿主侧 5 分钟超时默认拒绝后无回执帧：客户端同步兜底收起
      dialogTimers.set(
        event.requestId,
        setTimeout(() => {
          dialogTimers.delete(event.requestId);
          const stillPending = store.getState().dialogs.some((dialog) => dialog.requestId === event.requestId);
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
      unsubscribe ??= client.subscribe((batch) => {
        const parsed: UiEvent[] = [];
        for (const raw of batch) {
          const event = parseEvent(raw);
          if (event !== null) parsed.push(event);
        }
        // 批内相邻同类 delta 折叠后再逐条折叠进 store（批本身有序，不重排）
        for (const event of coalesceEvents(parsed)) onEvent(event);
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
      // 聚焦会话懒恢复：启动不再全量 resume，bootstrap 自动选中的会话若是 parked 占位需唤醒
      // （历史水化由工作区激活 effect 跟随 state 翻转完成，此处只负责唤活与激活）
      const active = store.getState().activeThreadId;
      if (active !== null) wakeAndActivate(active);
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
      // 懒恢复兜底：目标会话还是 parked 占位（启动对账/重启回落）时先唤活再投递；
      // 非 parked 原样返回（dead 由 hub 下条命令自动恢复）
      const liveId = await ensureLiveSession(threadId);
      if (liveId === null) return 'resume_failed';
      if (liveId !== threadId) store.getState().setActiveThread(liveId);
      const payloads = images === undefined || images.length === 0 ? undefined : [...images];
      const withImages = payloads === undefined ? {} : { images: payloads };
      // 投递裁决交给 hub 的原子语义（prompt+streamingBehavior）：空闲立即发送、
      // 流式中按模式入队并在轮末自动消费。不得以本地 streaming 镜像选路——
      // 镜像滞留 true 时会把空闲会话的消息投进永远不会被消费的队列。
      const outcome = await client.invoke('session/prompt', {
        threadId: liveId,
        message: text,
        streamingBehavior: mode === 'steer' ? 'steer' : 'followUp',
        ...withImages,
      });
      return outcome.ok ? null : outcome.reason;
    },
    async stopActiveTurn(threadId: string): Promise<void> {
      store.getState().stopIntent(threadId);
      await client.invoke('session/abort', { threadId });
    },
    async createSession(cwd: string, model?: { provider: string; modelId: string }, trusted?: boolean): Promise<string | null> {
      const outcome = await client.invoke('session/start', { cwd, provider: model?.provider, modelId: model?.modelId, trusted });
      if (!outcome.ok) return outcome.reason;
      store.getState().setActiveThread(outcome.data.threadId);
      await hydrateFull(outcome.data.threadId).catch(() => undefined);
      return null;
    },
    async openSavedSession(sessionPath: string, trusted?: boolean): Promise<boolean> {
      // 同文件已在会话表（占位点击与 History 打开收敛）：直接激活，不撞 hub 双开守卫
      const existing = Object.values(store.getState().sessions).find((session) => session.sessionPath === sessionPath);
      const liveId = existing !== undefined ? await this.ensureLiveSession(existing.threadId) : await resumeByPath(sessionPath, trusted);
      if (liveId === null) {
        store.getState().pushNotice(copy.flow.resumeFailed);
        return false;
      }
      store.getState().setActiveThread(liveId);
      await hydrateFull(liveId).catch(() => undefined);
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
      const liveId = await resumeByPath(sessionPath, trusted);
      if (liveId === null) {
        // 失败兜底：旧线程已被移除，刷新历史列表让会话可从 History 找回
        await this.refreshSaved();
        return false;
      }
      if (wasActive) store.getState().setActiveThread(liveId);
      await hydrateFull(liveId).catch(() => undefined);
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
      await refreshActiveSessionRules();
      return outcome.data;
    },
    async writePermissionRules(rules: PermissionRules): Promise<string | null> {
      const outcome = await client.invoke('permission/write', { rules });
      if (!outcome.ok) return outcome.reason;
      store.setState({ permissionRules: outcome.data });
      await refreshActiveSessionRules();
      return null;
    },
    async readSessionRules(threadId: string): Promise<{ rules: PermissionRules; source: 'thread' | 'global' } | null> {
      const outcome = await client.invoke('permission/sessionRead', { threadId });
      if (!outcome.ok) return null;
      // 判活：请求在途期间活跃会话已切换则丢弃（防旧会话规则覆盖新会话视图；与 refreshAgents 同型）
      if (store.getState().activeThreadId !== threadId) return null;
      // 引用幂等：内容相同不换引用（下游草稿重置 effect 依赖引用，防刷新循环击穿用户编辑）
      const current = store.getState().sessionRules;
      if (current !== null && current.source === outcome.data.source && JSON.stringify(current.rules) === JSON.stringify(outcome.data.rules)) {
        return current;
      }
      store.setState({ sessionRules: outcome.data });
      return outcome.data;
    },
    async writeSessionRules(threadId: string, rules: PermissionRules | null): Promise<string | null> {
      const outcome = await client.invoke('permission/sessionWrite', { threadId, rules });
      return outcome.ok ? null : outcome.reason;
    },
    async steerSubagent(threadId: string, subagentId: string, message: string): Promise<string | null> {
      const text = message.trim();
      if (text.length === 0) return 'empty_message';
      const outcome = await client.invoke('subagent/steer', { threadId, subagentId, message: text });
      return outcome.ok ? null : outcome.reason;
    },
    async fetchDiagnostics(): Promise<{ hostPhase: 'starting' | 'ready' | 'restarting' | 'failed' | null; stderrTail: string; registrySessions: number } | null> {
      const outcome = await client.invoke('app/diagnostics', {});
      return outcome.ok ? outcome.data : null;
    },
    restartHost(): void {
      void client.invoke('app/restartHost', {}).then(() => undefined);
    },
    async refreshAgents(threadId: string | null): Promise<void> {
      const outcome = await client.invoke('agent/list', threadId === null ? {} : { threadId });
      if (!outcome.ok) return;
      // 判活：请求发出后会话已切换则丢弃（防陈旧目录覆盖新会话视角）
      if (threadId !== null && store.getState().activeThreadId !== threadId) return;
      store.setState({ agents: outcome.data });
    },
    async refreshSkills(): Promise<void> {
      const outcome = await client.invoke('skills/list', {});
      if (outcome.ok) store.setState({ skills: outcome.data });
    },
    async setSkillEnabled(name: string, enabled: boolean): Promise<{ ok: true; data: SkillView[] } | { ok: false; reason: string }> {
      const outcome = await client.invoke('skills/setEnabled', { name, enabled });
      if (!outcome.ok) return { ok: false, reason: outcome.reason };
      store.setState({ skills: outcome.data });
      return { ok: true, data: outcome.data };
    },
    async applySkillToggle(name: string, enabled: boolean): Promise<{ ok: true; reopenFailures: number } | { ok: false; reason: string }> {
      // 链式排队：重开链在途时后续开关追加到队尾（持有新快照，不与在途循环交错）
      const run = async (): Promise<{ ok: true; reopenFailures: number } | { ok: false; reason: string }> => {
        const outcome = await this.setSkillEnabled(name, enabled);
        if (!outcome.ok) return { ok: false, reason: outcome.reason };
        let reopenFailures = 0;
        for (const session of Object.values(store.getState().sessions)) {
          if (session.state !== 'live') continue;
          const reopened = await this.reopenSession(session.threadId);
          if (!reopened) reopenFailures += 1;
        }
        return { ok: true, reopenFailures };
      };
      const chained = skillToggleChain.then(run, run);
      skillToggleChain = chained.then(
        () => undefined,
        () => undefined,
      );
      return chained;
    },
    async reopenSession(threadId: string): Promise<boolean> {
      const sessionPath = store.getState().sessions[threadId]?.sessionPath ?? null;
      if (sessionPath === null || sessionPath.length === 0) return false;
      const wasActive = store.getState().activeThreadId === threadId;
      const stop = await client.invoke('session/stop', { threadId });
      if (!stop.ok) return false;
      const liveId = await resumeByPath(sessionPath);
      if (liveId === null) {
        await this.refreshSaved();
        return false;
      }
      if (wasActive) store.getState().setActiveThread(liveId);
      await hydrateFull(liveId).catch(() => undefined);
      await this.refreshSaved();
      return true;
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
    async forkSession(threadId: string, entryId: string): Promise<string | null> {
      const outcome = await client.invoke('session/fork', { threadId, entryId, position: 'before' });
      if (!outcome.ok) return null;
      store.getState().setActiveThread(outcome.data.threadId);
      await hydrateFull(outcome.data.threadId).catch(() => undefined);
      return outcome.data.threadId;
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
    async upsertProvider(input: { name: string; baseUrl: string; api: string; models: ProviderModel[]; thinkingFormat?: ThinkingFormat; apiKey?: string }): Promise<boolean> {
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
    ensureLiveSession,
    wakeAndActivate,
    selectSession(threadId: string): void {
      const session = store.getState().sessions[threadId];
      // parked 占位不直接激活：先懒恢复，成功后以响应 threadId 激活
      if (session?.state === 'parked') {
        wakeAndActivate(threadId);
        return;
      }
      store.getState().setActiveThread(threadId);
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
