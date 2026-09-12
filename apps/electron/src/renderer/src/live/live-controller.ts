import type { AgentDefinition, CommandView, ImagePayload, PermissionRules, PreferencesView, ProviderModel, SkillView, ThinkingFormat, UiEvent } from '@paiapp/contracts';

import { copy } from '@/strings';
import { queuedDrafts } from '@/composer/queued-drafts';
import type { BridgeClient } from './client-invoke';
import { createRuntimeController } from './runtime-controller';
import { createBashEndProbe } from './bash-end-probe';
import { createEntryHydration, createReadonlyHydration } from './entry-hydration';
import { createDialogTimers } from './dialog-timers';
import { createLazyResume } from './lazy-resume';
import { createReadPorts } from './read-ports';
import { checkoutGitBranch, listGitBranches, listGitGraph, searchFiles } from './git-actions';
import { nextSessionRulesForMode } from './permission-mode';
import type { CreateSessionInput, CreateSessionOutcome, LiveController } from './live-controller-types';
import type { LiveStore } from './store';

/**
 * live 编排：事件订阅 → store 折叠；轮次边界的条目对账（真相源）；
 * 全部用户动作（发消息/停止/会话管理/对话框应答/模型切换）。
 *
 * 对账时序：turnStarted → 拉 entries（捕捉用户回显与通知注入）；
 * turnSettled → 再拉（以权威条目替换 live 轮次；失败则保留装饰态）。
 */

const RECONCILE_SETTLE_DELAY_MS = 120;

export type { CreateSessionInput, CreateSessionOutcome, LiveController } from './live-controller-types';

export function createLiveController(client: BridgeClient, store: LiveStore): LiveController {
  let unsubscribe: (() => void) | null = null;
  let disposed = true;
  /** 技能开关编排链（串行化，防多次开关的重开循环交错） */
  let skillToggleChain: Promise<void> = Promise.resolve();
  /** 对账在途标记（每线程一个），防止重复拉取。 */
  const reconciling = new Set<string>();

  const now = (): number => Date.now();

  const refreshAgentDefinitions = async (): Promise<void> => {
    const outcome = await client.invoke('agent/definitions', {});

    if (outcome.ok) store.setState({ agentDefinitions: outcome.data });
  };

  /** 会话条目水化三路径（增量对账/轮末重建/冷启动全量）独立模块。 */
  const { fetchEntries, rebuildFromTranscript, hydrateFull } = createEntryHydration({
    client,
    store,
    reconciling,
    isDisposed: () => disposed,
  });

  /** 懒恢复机制（在途去重/乐观登记）独立模块。 */
  const lazy = createLazyResume(client, store);
  const { resumeByPath, ensureLiveSession, activate } = lazy;

  /** 收敛读口（能力探测缓存属本控制器实例：渲染层重载即新实例，宿主代际变化显式失效）。 */
  const ports = createReadPorts(client);

  /** 直执行 bash 的收尾探测（协议无终态帧 → 输出静默后读口确认收尾；仍在跑时有界重排）。
   *  声明须先于 readonlyHydration（后者注入 ports）。 */
  const bashProbe = createBashEndProbe({
    probe: (threadId) => ports.inflight(threadId),
    isDisposed: () => disposed,
    onSettled: (threadId) => {
      store.getState().bashSettled(threadId);
      const cursor = store.getState().threads[threadId]?.cursor ?? null;
      void fetchEntries(threadId, cursor, false).catch(() => undefined);
    },
    onStillRunning: (threadId) => bashProbe.rearm(threadId),
  });

  /** 只读水化链（纳管→直读→model 补齐；纳管失败回落 resume）独立模块。 */
  const readonlyHydration = createReadonlyHydration({
    client,
    store,
    ports,
    resumeByPath: (sessionPath) => resumeByPath(sessionPath),
    activate,
    isDisposed: () => disposed,
    onInflightApplied: (threadId, bashRunning) => {
      // 收敛路径重建了「直执行 bash 在跑」的横幅 → 同样要布收尾探测（否则静默结束的横幅永亮）
      if (bashRunning) bashProbe.arm(threadId);
    },
    onDialogsHydrated: (dialogs) => {
      // 重载重建的弹窗与事件到达的弹窗同口径：宿主超时默认拒绝后无回执帧，仍要兜底收起
      for (const dialog of dialogs) {
        dialogTimers.arm(dialog.requestId, dialog.threadId, () => {
          const stillPending = store.getState().dialogs.some((pending) => pending.requestId === dialog.requestId);
          if (stillPending) void controller.cancelDialog(dialog.requestId);
        });
      }
    },
  });

  /** 对话框兜底定时器（属主线程随行回收；单一真相 live/dialog-timers） */
  const dialogTimers = createDialogTimers();

  /** 全局规则真相更新后刷新活跃会话的生效视图（source=global 时 rules 即全局内容，不得滞留旧值）。 */
  const refreshActiveSessionRules = async (): Promise<void> => {
    const active = store.getState().activeThreadId;
    if (active === null) return;
    await controller.readSessionRules(active).catch(() => undefined);
  };

  /** 只拉全局规则文件真相（不带活跃会话回读——boot 阶段活跃线程可能是 parked 占位）。 */
  const refreshGlobalRules = async (): Promise<PermissionRules | null> => {
    const outcome = await client.invoke('permission/read', {});
    if (!outcome.ok) return null;
    store.setState({ permissionRules: outcome.data });
    return outcome.data;
  };

  /** 对话框本地结算：ui_response 只有 ack 无事件回执，宿主侧超时/未知 id 均静默——弹窗关闭由客户端自治。 */
  const settleDialog = (requestId: string): void => {
    dialogTimers.settle(requestId);
    store.getState().applyEvent({ type: 'dialogSettled', requestId }, Date.now());
  };

  const onEvent = (event: UiEvent): void => {
    const state = store.getState();
    state.applyEvent(event, now());
    if (event.type === 'host' && (event.phase === 'restarting' || event.phase === 'failed')) {
      // host 进程消亡：乐观登记的「已恢复」随 worker 全灭失效（对账会重发 parked 视图）；
      // 挂起弹窗兜底 timer 与轮首游标全部随进程消亡回收（与 dispose 同口径）
      lazy.invalidate();
      dialogTimers.clearAll();
      bashProbe.clearAll();
      // 宿主进程代际变化：读口可用性缓存（能力探测）随之失效重探（协议能力是 hub 的属性）
      ports.invalidate();
      return;
    }
    if (event.type === 'sessionRemoved') {
      // 线程移除后轮次永不结算：该线程挂起弹窗的兜底 timer 与 bash 收尾探测随行回收
      dialogTimers.dropThread(event.threadId);
      bashProbe.clear(event.threadId);
    }
    if (event.type === 'dialogRequest' && event.method !== 'notify' && event.method !== 'setStatus') {
      // 宿主侧 5 分钟超时默认拒绝后无回执帧：客户端同步兜底收起（超时回调复查
      // stillPending，已结算则 no-op）
      dialogTimers.arm(event.requestId, event.threadId, () => {
        const stillPending = store.getState().dialogs.some((dialog) => dialog.requestId === event.requestId);
        if (stillPending) void controller.cancelDialog(event.requestId);
      });
      return;
    }
    if (event.type === 'sessionDied') {
      // 线程消亡：该线程的挂起弹窗已被 store 折叠收走，兜底 timer 与 bash 收尾探测随行回收
      dialogTimers.dropThread(event.threadId);
      bashProbe.clear(event.threadId);
    }
    if (
      (event.type === 'messageStarted' || event.type === 'textDelta') &&
      state.threads[event.threadId]?.liveTurnId == null &&
      (state.threads[event.threadId]?.items.length ?? 0) > 0
    ) {
      // 错过 turnStarted 的在途轮（重载回落）：live 轮刚由本事件折出，而冷启动
      // 拉补已把该轮的持久前缀插入成独立折叠轮（同轮双渲染）——补挂一次重定基
      // 对账收回，settle 的权威重建统一收口
      void rebuildFromTranscript(event.threadId, null, { liveTurnPresent: () => true }).catch(() => undefined);
    }
    if (event.type === 'bashOutput') {
      // 重载前发起的直接执行：横幅无本地登记（事件折叠只写尾部输出），先点亮再排收尾探测
      if (state.threads[event.threadId]?.bashRunning !== true) store.getState().bashStarted(event.threadId);
      bashProbe.arm(event.threadId);
    }
    if (event.type === 'turnStarted') {
      // 轮首边界 = 读口事实（`get_inflight.turnStartEntryId`，agent_start 时刻的 leaf 条目 id）：
      // settle 窗口重建的 since 下界与尾 span 归属共用它；事件派生游标在重载场景必然丢失。
      // 守卫：读发出之后该轮若已结算 → 快照过期（事件只是迟到于结算），丢弃。
      const settledAtTurnStart = store.getState().threads[event.threadId]?.turnsSettled ?? 0;
      void ports
        .inflight(event.threadId)
        .then((view) => {
          if (disposed || view === null) return;
          if ((store.getState().threads[event.threadId]?.turnsSettled ?? 0) !== settledAtTurnStart) return;
          store.getState().hydrate(event.threadId, { kind: 'hydrate/inflight', view, at: Date.now() });
          if (view.bash !== null) bashProbe.arm(event.threadId);
        })
        .catch(() => undefined);
      // 用户回显/通知注入经条目对账到达（消息不走事件流）
      void fetchEntries(event.threadId, state.threads[event.threadId]?.cursor ?? null, false).catch(() => undefined);
    } else if (event.type === 'turnSettled') {
      // 等条目落盘的短延迟后【轮内窗口重建】：since = 轮首游标，以完整转写替换
      // 本轮 span（根治配对丢失的语义不变，长会话不再每轮 O(全部条目) 全量拉取；
      // 游标失效由主进程兜底全量重拉）。代际守卫：窗口内若新一轮已开始（followUp
      // 自动续轮），本次重建让位给下一轮的 settle——invoke 在途的翻代由
      // staleGuard 二次复检兜住。
      const settledTurnId = state.threads[event.threadId]?.liveTurnId ?? null;
      // 轮首边界取折叠态事实（本事件折叠前捕获的 state；fold 会在应用时清空该字段）
      const turnStartCursor = state.threads[event.threadId]?.turnStartEntryId ?? null;
      setTimeout(() => {
        if (disposed) return;
        const current = store.getState().threads[event.threadId];
        if (current !== undefined && current.liveTurnId !== settledTurnId) return;
        void rebuildFromTranscript(event.threadId, turnStartCursor, {
          staleGuard: () => {
            const latest = store.getState().threads[event.threadId];
            return latest !== undefined && latest.liveTurnId !== null && latest.liveTurnId !== settledTurnId;
          },
        }).catch(() => undefined);
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
        // 事件到达即逐条同步折叠进 store（无批缓冲：主进程直发，渲染层 zustand
        // 订阅直出）；壳层混入的非 UiEvent 消息按形状静默丢弃
        const event = parseEvent(raw);
        if (event !== null) onEvent(event);
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
      // 全局权限规则启动即载（新任务页权限控件的唯一数据源；此前仅设置页进入时拉取）
      void refreshGlobalRules();
      // bootstrap 自动选中的 parked 会话保持只读激活（历史经直读水化），
      // 发消息才唤醒 worker（T27：读不唤醒）
    },
    dispose(): void {
      disposed = true;
      dialogTimers.clearAll();
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
      // 纯图消息合法投递（fork 重试带图）：文本与图片都空才是空消息
      if (text.length === 0 && (images === undefined || images.length === 0)) return 'empty_message';
      const session = store.getState().sessions[threadId];
      if (session?.state === 'parked' && !client.available) return 'bridge_unavailable';
      // 懒恢复兜底：目标会话还是 parked 占位（启动对账/重启回落）时先唤活再投递；
      // 非 parked 原样返回（dead 由 hub 下条命令自动恢复）
      const liveId = await ensureLiveSession(threadId);
      if (liveId === null) return 'resume_failed';
      // 换 id 时同步激活（旧占位由主进程 sessionRemoved 清出）；唤醒在途已被切走则只投递不劫持
      if (liveId !== threadId && store.getState().activeThreadId === threadId) activate(liveId);
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
    async createSession(input: CreateSessionInput): Promise<CreateSessionOutcome> {
      const outcome = await client.invoke('session/start', {
        cwd: input.cwd,
        provider: input.model?.provider,
        modelId: input.model?.modelId,
        trusted: input.trusted,
      });
      if (!outcome.ok) return { ok: false, reason: outcome.reason };
      const { threadId } = outcome.data;
      activate(threadId);
      await hydrateFull(threadId).catch(() => undefined);
      // 后置应用（thread/start 不收这两个参数）：思考档按新线程寻址；权限模式以全局规则为基线建 sidecar
      if (input.thinkingLevel !== undefined && input.thinkingLevel.length > 0) {
        await client.invoke('session/setThinking', { threadId, level: input.thinkingLevel });
      }
      if (input.permissionMode !== undefined) {
        // 全局规则未载时现拉（建会话后置应用的基线；拉不到则本次选择放弃，不臆造基线）
        const globalRules = store.getState().permissionRules ?? (await refreshGlobalRules());
        const rules = globalRules === null ? null : nextSessionRulesForMode(globalRules, input.permissionMode);
        if (rules !== null) await client.invoke('permission/sessionWrite', { threadId, rules });
      }
      return { ok: true, threadId };
    },
    async openSavedSession(sessionPath: string, trusted?: boolean): Promise<boolean> {
      // 同文件已在会话表（占位点击与 History 打开收敛）：不撞 hub 双开守卫。
      // parked/dead 占位是纯浏览意图——只读激活走纳管直读链（T27 读不唤醒）；
      // live 会话幂等用既有 id
      const existing = Object.values(store.getState().sessions).find((session) => session.sessionPath === sessionPath);
      let liveId: string | null;
      if (existing === undefined) {
        liveId = await resumeByPath(sessionPath, trusted);
      } else if (existing.state === 'live') {
        liveId = existing.threadId;
      } else {
        activate(existing.threadId);
        await readonlyHydration.ensureHydrated(existing.threadId);
        await this.refreshSaved();
        return true;
      }
      if (liveId === null) {
        store.getState().pushNotice(copy.flow.resumeFailed);
        return false;
      }
      activate(liveId);
      await hydrateFull(liveId).catch(() => undefined);
      await this.refreshSaved();
      return true;
    },
    async reloadSessionTrusted(threadId: string, trusted: boolean): Promise<boolean> {
      const sessionPath = store.getState().sessions[threadId]?.sessionPath ?? null;
      if (sessionPath === null || sessionPath.length === 0) return false;
      // 在途懒恢复先结算（trusted 分歧的去重通路会静默降级信任态，必须串行化后再重开）
      await ensureLiveSession(threadId).catch(() => undefined);
      // 记住重开前是否活跃：resume 成功后仅在该会话原本活跃时跟随切换（用户在途切换别会话时不劫持）
      const wasActive = store.getState().activeThreadId === threadId;
      const stop = await client.invoke('session/stop', { threadId, remove: false });
      if (!stop.ok) return false;
      lazy.discardResumed(sessionPath);
      const liveId = await resumeByPath(sessionPath, trusted);
      if (liveId === null) {
        // 失败兜底：旧线程已被移除，刷新历史列表让会话可从 History 找回
        await this.refreshSaved();
        return false;
      }
      if (wasActive) activate(liveId);
      await hydrateFull(liveId).catch(() => undefined);
      await this.refreshSaved();
      return true;
    },
    async closeSession(threadId: string): Promise<void> {
      // 用户关闭：stop(dispose) + 注册表删行（remove 路由语义）；本地暂存
      // 排队随之硬丢弃（重开/懒恢复类移除不走这里——那类按路径改绑，见 queued-flush）
      queuedDrafts.dropThread(threadId);
      const sessionPath = store.getState().sessions[threadId]?.sessionPath ?? null;
      await client.invoke('session/stop', { threadId, remove: true });
      if (sessionPath !== null) lazy.discardResumed(sessionPath);
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
      const rules = await refreshGlobalRules();
      if (rules === null) return null;
      await refreshActiveSessionRules();
      return rules;
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
      // 判活：请求在途期间活跃会话已切换则丢弃（防旧会话规则覆盖新会话视图；与目录刷新同型）
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
    restartHost(): void {
      void client.invoke('app/restartHost', {}).then(() => undefined);
    },
    runtime: createRuntimeController(client),
    async refreshAgentDefinitions(): Promise<void> {
      await refreshAgentDefinitions();
    },
    async upsertAgentDefinition(definition: AgentDefinition, previous: { file: string; scope: 'user' | 'project'; project: string | null } | null): Promise<string | null> {
      const outcome = await client.invoke('agent/upsert', { definition, previous });
      if (!outcome.ok) return outcome.reason;
      await refreshAgentDefinitions();
      return null;
    },
    async removeAgentDefinition(key: { file: string; scope: 'user' | 'project'; project: string | null }): Promise<string | null> {
      const outcome = await client.invoke('agent/remove', key);
      if (!outcome.ok) return outcome.reason;
      await refreshAgentDefinitions();
      return null;
    },    async refreshSkills(): Promise<void> {
      const outcome = await client.invoke('skills/list', {});
      if (outcome.ok) store.setState({ skills: outcome.data });
    },
    /** 预会话命令目录（新建任务页 `/` 补全数据源；失败空目录降级）。 */
    async fetchCommandPreview(): Promise<CommandView[]> {
      const outcome = await client.invoke('command/preview', {});
      return outcome.ok ? outcome.data : [];
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
      const stop = await client.invoke('session/stop', { threadId, remove: false });
      if (!stop.ok) return false;
      lazy.discardResumed(sessionPath);
      const liveId = await resumeByPath(sessionPath);
      if (liveId === null) {
        await this.refreshSaved();
        return false;
      }
      if (wasActive) activate(liveId);
      await hydrateFull(liveId).catch(() => undefined);
      await this.refreshSaved();
      return true;
    },
    async runBash(threadId: string, command: string): Promise<string | null> {
      const text = command.trim();
      if (text.length === 0) return 'empty_command';
      const cursorBefore = store.getState().threads[threadId]?.cursor ?? null;
      store.getState().bashStarted(threadId);
      try {
        // invoke reject（桥断连等）同样必须落 bashSettled：executing 永真会使
        // 消息流尾部永久 loading 且 1Hz 走表定时器永不停
        const outcome = await client.invoke('session/bash', { threadId, command: text });
        bashProbe.clear(threadId);
        store.getState().bashSettled(threadId);
        // bash 与模型轮并发（流式中直执行）时在途内容未落盘：重建一律降级为
        // 不拆轮的 reconcile，权威替换留给轮结算
        await rebuildFromTranscript(threadId, cursorBefore, {
          liveTurnPresent: () => store.getState().threads[threadId]?.streaming === true,
        }).catch(() => undefined);
        return outcome.ok ? null : outcome.reason;
      } catch {
        store.getState().bashSettled(threadId);
        return 'bridge_unavailable';
      }
    },
    async abortBash(threadId: string): Promise<void> {
      await client.invoke('session/abortBash', { threadId });
    },
    async revealSession(sessionPath: string): Promise<void> {
      await client.invoke('session/reveal', { sessionPath });
    },
    async forkSession(threadId: string, entryId: string): Promise<{ ok: true; threadId: string } | { ok: false; reason: string }> {
      const outcome = await client.invoke('session/fork', { threadId, entryId, position: 'before' });
      if (!outcome.ok) return { ok: false, reason: outcome.reason };
      // fork 是原地换轨：旧 id 已失效且不再有事件，运行面镜像就地终态
      store.getState().parkThread(threadId);
      activate(outcome.data.threadId);
      await hydrateFull(outcome.data.threadId).catch(() => undefined);
      return { ok: true, threadId: outcome.data.threadId };
    },
    searchFiles: (cwd: string, query: string) => searchFiles(client, cwd, query),
    listGitBranches: (cwd: string) => listGitBranches(client, cwd),
    listGitGraph: (cwd: string) => listGitGraph(client, cwd),
    checkoutGitBranch: (cwd: string, branch: string, create: boolean) => checkoutGitBranch(client, cwd, branch, create),
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
    async updatePreferences(patch: { defaultModel?: string | null; onboarded?: boolean; projectModels?: Record<string, string>; pinnedSessions?: string[]; trustedDefault?: boolean; hiddenProjects?: string[]; archivedSessions?: string[]; hubDev?: { bunPath: string | null; hubEntry: string | null } }): Promise<PreferencesView | null> {
      const outcome = await client.invoke('app/setPreference', patch);
      if (!outcome.ok) return null;
      store.setState({ preferences: outcome.data });
      return outcome.data;
    },
    async testProvider(name: string, modelId: string | undefined): Promise<{ ok: true; latencyMs: number } | { ok: false; reason: string }> {
      const outcome = await client.invoke('provider/test', modelId === undefined ? { name } : { name, modelId });
      return outcome.ok ? { ok: true, latencyMs: outcome.data.latencyMs } : { ok: false, reason: outcome.reason };
    },
    async refreshStats(threadId: string): Promise<void> {
      const outcome = await client.invoke('session/stats', { threadId });
      if (outcome.ok) store.getState().updateStats(threadId, outcome.data);
    },
    ensureHydrated: (threadId: string, options?: { force?: boolean }) => readonlyHydration.ensureHydrated(threadId, options),
    selectSession(threadId: string): void {
      // parked 只读激活（历史经 host 直读水化，不唤醒 worker）；
      // 发消息走 submitDraft 的 ensureLiveSession 兜底唤醒（T27：读不唤醒、写才唤醒）
      activate(threadId);
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
