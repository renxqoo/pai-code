import type { ImagePayload, PermissionRules, ProviderModel, ThinkingFormat } from '@paiapp/contracts';

import { copy } from '@/strings';
import { pickSessionModel } from './pick-session-model';
import { nextSessionRulesForMode } from './permission-mode';
import { bridgeClient, controller, store } from './workspace-runtime';

/**
 * 稳定动作面：引用恒定（不随渲染重建），全部动作在调用时读 store 真相，
 * 消灭闭包旧值与「actions 换引用击穿子组件 memo / effect 重挂」两类问题。
 * 唯一外来依赖是 hook 注入的 setState setter（引用本身恒定）。
 */

const EFFORT_LABELS: Readonly<Record<string, string>> = {
  off: 'Off',
  minimal: 'Minimal',
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  xhigh: 'X-high',
  max: 'Max',
};

export type WorkspaceDiagnostics = {
  hostPhase: 'starting' | 'ready' | 'restarting' | 'failed' | null;
  stderrTail: string;
  registrySessions: number;
};

export type WorkspaceActions = {
  readonly submitDraft: (message: string, images?: readonly ImagePayload[], mode?: 'auto' | 'steer' | 'followUp') => Promise<string | null>;
  readonly stopActiveTurn: () => void;
  readonly selectSession: (threadId: string) => void;
  readonly createSession: (cwd: string, trusted?: boolean) => Promise<boolean>;
  readonly openSavedSession: (sessionPath: string) => Promise<boolean>;
  readonly closeSession: (threadId: string) => void;
  readonly selectModel: (value: string) => void;
  readonly selectEffort: (value: string) => void;
  readonly respondDialog: (requestId: string, payload: Record<string, unknown>) => void;
  readonly cancelDialog: (requestId: string) => void;
  readonly dismissNotice: (id: string) => void;
  readonly refreshSaved: () => void;
  readonly refreshCredentials: () => void;
  readonly refreshModels: () => void;
  readonly setProviderKey: (provider: string, apiKey: string) => Promise<boolean>;
  readonly removeProviderKey: (provider: string) => Promise<boolean>;
  readonly setDefaultModel: (value: string | null) => void;
  readonly completeOnboarding: () => void;
  readonly refreshPermissionRules: () => void;
  readonly writePermissionRules: (rules: PermissionRules) => Promise<boolean>;
  readonly readSessionRules: () => void;
  readonly writeSessionRules: (rules: PermissionRules | null) => Promise<boolean>;
  /** 操作栏会话权限模式切换：当前生效规则为基线只改 mode；同模式无操作不写。 */
  readonly setSessionPermissionMode: (mode: PermissionRules['mode']) => Promise<boolean>;
  readonly refreshAgents: () => void;
  /** 技能目录刷新（设置页技能分区进入时）。 */
  readonly refreshSkills: () => void;
  /** 技能启停：落盘后重开全部活跃会话使新设置生效（失败 notice）。 */
  readonly setSkillEnabled: (name: string, enabled: boolean) => Promise<boolean>;
  readonly searchFiles: (query: string) => Promise<string[] | null>;
  readonly runBash: (command: string) => Promise<string | null>;
  readonly abortBash: () => void;
  readonly clearQueue: () => void;
  readonly revealSession: (sessionPath: string) => void;
  /** 系统目录选择对话框；null = 取消（新会话弹窗浏览入口）。 */
  readonly pickDirectory: (defaultPath: string | null) => Promise<string | null>;
  readonly togglePinnedSession: (sessionPath: string) => void;
  readonly forkFromEntry: (entryId: string) => Promise<string | null>;
  readonly reloadSessionTrusted: (threadId: string, trusted: boolean) => void;
  readonly steerSubagent: (subagentId: string, message: string) => void;
  readonly fetchDiagnostics: () => void;
  readonly restartHost: () => void;
  /** 打开 Usage 页时对全部活跃线程补拉 stats（防未访问会话显示 0）。 */
  readonly refreshAllStats: () => void;
  /** 通用通知（bash 携图拒绝等接线层提示）。 */
  readonly showNotice: (text: string) => void;
  /** J2 通用偏好保存（trustedDefault / 宿主路径）。 */
  readonly saveGeneralPreferences: (patch: { trustedDefault?: boolean }) => Promise<boolean>;
  readonly testProvider: (name: string) => Promise<{ ok: true; latencyMs: number } | { ok: false; reason: string }>;
  readonly upsertProvider: (input: { name: string; baseUrl: string; api: string; models: ProviderModel[]; thinkingFormat?: ThinkingFormat; apiKey?: string }) => Promise<boolean>;
  readonly removeProvider: (name: string) => Promise<boolean>;
  readonly renameSession: (threadId: string, name: string) => Promise<boolean>;
  readonly compact: () => void;
};

/** 通知条写入（store 动作的便捷别名；保留最近 5 条）。 */
function pushNotice(text: string): void {
  store.getState().pushNotice(text);
}

/** 会话规则写链：写 + 回读成对串行排队，防并发写后回读乱序覆盖生效视图（与 controller.skillToggleChain 同型）。 */
let sessionRulesWriteChain: Promise<void> = Promise.resolve();

function activeThreadOf(): string {
  return store.getState().activeThreadId ?? '';
}

export function createWorkspaceActions(setDiagnostics: (value: WorkspaceDiagnostics | null) => void): WorkspaceActions {
  const readSessionRules = (): void => {
    const threadId = activeThreadOf();
    if (threadId.length === 0) return;
    void controller.readSessionRules(threadId);
  };
  const writeSessionRules = async (rules: PermissionRules | null): Promise<boolean> => {
    const threadId = activeThreadOf();
    if (threadId.length === 0) return false;
    // threadId 捕获于入队时刻（sidecar 是按线程寻址，不是按活跃会话相对寻址）
    const run = async (): Promise<boolean> => {
      const reason = await controller.writeSessionRules(threadId, rules);
      if (reason !== null) {
        pushNotice(copy.settings.permissionSaveFailed);
        return false;
      }
      await controller.readSessionRules(threadId);
      return true;
    };
    const chained = sessionRulesWriteChain.then(run, run);
    sessionRulesWriteChain = chained.then(
      () => undefined,
      () => undefined,
    );
    return chained;
  };

  return {
    submitDraft: async (message, images, mode) => {
      // 调用时读 store 真相：fork/重开等异步链路后的旧闭包不得打到旧线程；
      // parked 占位的懒恢复兜底在 controller.submitDraft 内（threadId 只信 resume 响应）
      const reason = await controller.submitDraft(activeThreadOf(), message, images, mode);
      if (reason !== null && reason !== 'bridge_unavailable') {
        pushNotice(reason === 'resume_failed' ? copy.flow.resumeFailed : copy.flow.sendFailed(reason));
      }
      return reason;
    },
    stopActiveTurn: () => void controller.stopActiveTurn(activeThreadOf()),
    selectSession: (threadId) => controller.selectSession(threadId),
    createSession: (cwd, trusted) => {
      // 项目默认模型记忆优先（A4）→ 全局默认 → 当前选择 → 首个可用（调用时读真相重算选择链）
      const state = store.getState();
      const active = state.activeThreadId !== null ? state.sessions[state.activeThreadId] : undefined;
      const firstModel = state.models[0];
      const fallback = firstModel !== undefined ? `${firstModel.provider}/${firstModel.modelId}` : '';
      const selected = pickSessionModel(
        state.models,
        state.preferences.projectModels[cwd] ?? state.preferences.defaultModel,
        active?.model ?? fallback,
      );
      return controller.createSession(cwd, selected, trusted).then((reason) => {
        if (reason !== null) pushNotice(copy.newThread.createFailed(reason));
        return reason === null;
      });
    },
    openSavedSession: (sessionPath) => controller.openSavedSession(sessionPath),
    closeSession: (threadId) => void controller.closeSession(threadId),
    selectEffort: (value: string) => {
      const level = Object.entries(EFFORT_LABELS).find(([, label]) => label === value)?.[0];
      if (level !== undefined) void controller.selectThinking(activeThreadOf(), level);
    },
    selectModel: (value: string) => {
      const state = store.getState();
      const model = state.models.find((entry) => `${entry.provider}/${entry.modelId}` === value);
      if (model === undefined) return;
      const threadId = state.activeThreadId ?? '';
      void controller.selectModel(threadId, model.provider, model.modelId);
      // 项目默认模型记忆（A4）：该 cwd 下次新建会话预选
      const cwd = state.activeThreadId !== null ? state.sessions[state.activeThreadId]?.cwd : undefined;
      if (cwd !== undefined && cwd.length > 0) {
        // 记忆上限 50 项：超出按插入序淘汰最旧（防 settings.json 无界增长）
        const entries = [...Object.entries(state.preferences.projectModels), [cwd, value] as const];
        const projectModels = Object.fromEntries(entries.slice(Math.max(0, entries.length - 50)));
        void controller.updatePreferences({ projectModels });
      }
    },
    respondDialog: (requestId, payload) => void controller.respondDialog(requestId, payload),
    cancelDialog: (requestId) => void controller.cancelDialog(requestId),
    dismissNotice: (id) => store.getState().dismissNotice(id),
    refreshSaved: () => void controller.refreshSaved(),
    refreshCredentials: () => void controller.refreshCredentials(),
    refreshModels: () => void controller.refreshModels(),
    setProviderKey: async (provider, apiKey) => {
      const reason = await controller.setProviderKey(provider, apiKey);
      if (reason !== null) pushNotice(copy.settings.keySaveFailed(reason));
      return reason === null;
    },
    removeProviderKey: async (provider) => {
      const reason = await controller.removeProviderKey(provider);
      if (reason !== null) pushNotice(copy.settings.keyRemoveFailed(reason));
      return reason === null;
    },
    setDefaultModel: (value) => {
      void controller.updatePreferences({ defaultModel: value }).then((next) => {
        if (next === null) pushNotice(copy.settings.preferenceSaveFailed);
      });
    },
    completeOnboarding: () => {
      void controller.updatePreferences({ onboarded: true }).then((next) => {
        if (next === null) pushNotice(copy.settings.preferenceSaveFailed);
      });
    },
    testProvider: (name) => controller.testProvider(name),
    refreshPermissionRules: () => {
      void controller.refreshPermissionRules();
    },
    readSessionRules,
    writeSessionRules,
    setSessionPermissionMode: async (mode) => {
      const threadId = activeThreadOf();
      if (threadId.length === 0) return false;
      const current = store.getState().sessionRules ?? (await controller.readSessionRules(threadId));
      // 未加载即无入口（控件隐藏），静默失败即可
      if (current === null) return false;
      const next = nextSessionRulesForMode(current.rules, mode);
      if (next === null) return true;
      return writeSessionRules(next);
    },
    writePermissionRules: async (rules) => {
      const reason = await controller.writePermissionRules(rules);
      if (reason !== null) pushNotice(copy.settings.permissionSaveFailed);
      return reason === null;
    },
    fetchDiagnostics: () => {
      void controller.fetchDiagnostics().then((data) => setDiagnostics(data));
    },
    refreshAllStats: () => {
      for (const threadId of Object.keys(store.getState().sessions)) {
        void controller.refreshStats(threadId);
      }
    },
    showNotice: (text) => {
      pushNotice(text);
    },
    saveGeneralPreferences: async (patch) => {
      const next = await controller.updatePreferences(patch);
      if (next === null) {
        pushNotice(copy.settings.generalSaveFailed);
        return false;
      }
      return true;
    },
    restartHost: () => controller.restartHost(),
    reloadSessionTrusted: (threadId, trusted) => {
      void controller.reloadSessionTrusted(threadId, trusted).then((ok) => {
        if (!ok) pushNotice(copy.thread.reloadTrustFailed);
      });
    },
    refreshAgents: () => {
      void controller.refreshAgents(activeThreadOf().length > 0 ? activeThreadOf() : null);
    },
    refreshSkills: () => {
      void controller.refreshSkills();
    },
    setSkillEnabled: async (name, enabled) => {
      // 生效编排走 controller 排队链：写 pi settings + 串行重开全部 live 会话（信任态由注册表补全）
      const outcome = await controller.applySkillToggle(name, enabled);
      if (!outcome.ok && outcome.reason !== 'skill_not_found') {
        pushNotice(copy.settings.skillToggleFailed);
        return false;
      }
      if (outcome.ok && outcome.reopenFailures > 0) pushNotice(copy.settings.skillReopenFailed);
      return outcome.ok;
    },
    searchFiles: (query) => {
      const state = store.getState();
      const cwd = state.activeThreadId !== null ? state.sessions[state.activeThreadId]?.cwd ?? '' : '';
      return controller.searchFiles(cwd, query);
    },
    runBash: async (command) => {
      const reason = await controller.runBash(activeThreadOf(), command);
      if (reason !== null) pushNotice(copy.flow.bashFailed(reason));
      return reason;
    },
    abortBash: () => void controller.abortBash(activeThreadOf()),
    clearQueue: () => void controller.clearQueue(activeThreadOf()),
    revealSession: (sessionPath) => void controller.revealSession(sessionPath),
    pickDirectory: async (defaultPath) => {
      const outcome = await bridgeClient.invoke('dialog/pickDirectory', defaultPath !== null ? { defaultPath } : {});
      if (!outcome.ok) {
        // 失败与取消区分：取消静默，失败要给用户反馈（通知条层级高于弹窗）
        pushNotice(copy.newThread.pickFailed);
        return null;
      }
      return outcome.data;
    },
    togglePinnedSession: (sessionPath) => {
      const current = store.getState().preferences.pinnedSessions;
      const pinnedSessions = current.includes(sessionPath)
        ? current.filter((path) => path !== sessionPath)
        : [...current, sessionPath];
      void controller.updatePreferences({ pinnedSessions }).then((next) => {
        if (next === null) pushNotice(copy.settings.preferenceSaveFailed);
      });
    },
    forkFromEntry: async (entryId) => {
      const newThreadId = await controller.forkSession(activeThreadOf(), entryId);
      if (newThreadId === null) pushNotice(copy.flow.forkFailed);
      return newThreadId;
    },
    upsertProvider: (input) => controller.upsertProvider(input),
    removeProvider: (name) => controller.removeProvider(name),
    renameSession: async (threadId, name) => {
      const ok = await controller.renameSession(threadId, name);
      if (!ok) pushNotice(copy.sidebar.renameFailed);
      return ok;
    },
    compact: () => {
      void controller.compact(activeThreadOf()).then((reason) => {
        if (reason !== null) pushNotice(copy.flow.compactFailed(reason));
      });
    },
    steerSubagent: (subagentId, message) => {
      void controller.steerSubagent(activeThreadOf(), subagentId, message).then((reason) => {
        if (reason !== null) pushNotice(copy.flow.steerFailed(reason));
      });
    },
  };
}
