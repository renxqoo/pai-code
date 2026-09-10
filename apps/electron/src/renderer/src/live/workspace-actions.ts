import type { AgentDefinition, ApiOutcome, CommandView, IdleRecycleMinutes, ImagePayload, PermissionRules, ProviderModel, RuntimeSnapshotView, ThinkingFormat } from '@paiapp/contracts';
import { thinkingLevelOfLabel } from '@paiapp/contracts';

import { writeClipboard } from '@/lib/write-clipboard';
import { copy } from '@/strings';
import { parseModelKey, pickSessionModel } from './pick-session-model';
import { nextSessionRulesForMode } from './permission-mode';
import { bridgeClient, controller, store } from './workspace-runtime';
import { statsTargetsOf } from './stats-targets';

/**
 * 稳定动作面：引用恒定（不随渲染重建），全部动作在调用时读 store 真相，
 * 消灭闭包旧值与「actions 换引用击穿子组件 memo / effect 重挂」两类问题。
 * 唯一外来依赖是 hook 注入的 setState setter（引用本身恒定）。
 */

export type WorkspaceActions = {
  readonly submitDraft: (message: string, images?: readonly ImagePayload[], mode?: 'auto' | 'steer' | 'followUp') => Promise<string | null>;
  /** 指定线程投递（排队暂存的立即改向/轮末冲刷，目标可为后台线程）；失败通知与 submitDraft 同口径。 */
  readonly submitThreadDraft: (threadId: string, message: string, images?: readonly ImagePayload[], mode?: 'auto' | 'steer' | 'followUp') => Promise<string | null>;
  readonly stopActiveTurn: () => void;
  readonly selectSession: (threadId: string) => void;
  readonly createSession: (input: {
    cwd: string
    trusted?: boolean
    /** `provider/modelId`；缺省按项目记忆 → 全局默认 → 当前会话 → 首个可用重算 */
    model?: string
    thinkingLevel?: string
    permissionMode?: PermissionRules['mode']
  }) => Promise<boolean>;
  /** 新建任务页提交：建会话 → 投首条消息；sendFailed 时调用方把文本回填到新会话草稿槽。 */
  readonly startTask: (input: {
    cwd: string
    trusted: boolean
    /** `provider/modelId` */
    model: string
    /** null = 跟随全局规则 */
    permissionMode: PermissionRules['mode'] | null
    /** 思考档（协议档位值；null = 跟随模型默认） */
    thinkingLevel: string | null
    text: string
    images?: readonly ImagePayload[]
  }) => Promise<{ ok: true; threadId: string; sendFailed: boolean } | { ok: false }>;
  /** 新任务页初始模型键（项目记忆 → 全局默认 → 当前会话 → 首个可用；无模型返回 ''）。 */
  readonly defaultModelFor: (cwd: string) => string;
  readonly openSavedSession: (sessionPath: string) => Promise<boolean>;
  readonly closeSession: (threadId: string) => void;
  readonly selectModel: (value: string) => void;
  readonly selectEffort: (value: string) => void;
  readonly respondDialog: (requestId: string, payload: Record<string, unknown>) => void;
  readonly cancelDialog: (requestId: string) => void;
  readonly dismissNotice: (id: string) => void;
  readonly refreshSaved: () => void;
  readonly refreshModels: () => void;
  readonly setDefaultModel: (value: string | null) => void;
  readonly completeOnboarding: () => void;
  /** 重跑新手引导：onboarded 置回 false（偏好推回后工作区切回引导屏）。 */
  readonly restartOnboarding: () => Promise<boolean>;
  readonly refreshPermissionRules: () => void;
  readonly writePermissionRules: (rules: PermissionRules) => Promise<boolean>;
  readonly readSessionRules: () => void;
  readonly writeSessionRules: (rules: PermissionRules | null) => Promise<boolean>;
  /** 操作栏会话权限模式切换：当前生效规则为基线只改 mode；同模式无操作不写。 */
  readonly setSessionPermissionMode: (mode: PermissionRules['mode']) => Promise<boolean>;
  readonly refreshAgentDefinitions: () => void;
  /** 子 agent 定义保存（新建/编辑/改名/移动统一）；失败 reason 交表单内联呈现。 */
  readonly upsertAgentDefinition: (definition: AgentDefinition, previous: { file: string; scope: 'user' | 'project'; project: string | null } | null) => Promise<string | null>;
  /** 子 agent 定义删除；失败 reason 交表单内联呈现。 */
  readonly removeAgentDefinition: (key: { file: string; scope: 'user' | 'project'; project: string | null }) => Promise<string | null>;
  /** 技能目录刷新（设置页技能分区进入时）。 */
  readonly refreshSkills: () => void;
  /** 预会话命令目录（新建任务页打开时拉取；失败空目录降级）。 */
  readonly fetchCommandPreview: () => Promise<CommandView[]>;
  /** 技能启停：落盘后重开全部活跃会话使新设置生效（失败 notice）。 */
  readonly setSkillEnabled: (name: string, enabled: boolean) => Promise<boolean>;
  readonly searchFiles: (query: string) => Promise<string[] | null>;
  /** 指定目录的 @ 文件搜索（新任务页无活跃会话，按所选目录搜索）。 */
  readonly searchFilesIn: (cwd: string, query: string) => Promise<string[] | null>;
  /** 本地 git 分支列表（非仓库为空形态；失败 {ok:false}）。 */
  readonly listGitBranches: (cwd: string) => Promise<ApiOutcome<'git/branches'>>;
  /** 切换/创建并检出分支（失败原因交调用方转文案：切换走通知条，创建走弹窗内联）。 */
  readonly checkoutGitBranch: (cwd: string, branch: string, create: boolean) => Promise<ApiOutcome<'git/checkout'>>;
  readonly runBash: (command: string) => Promise<string | null>;
  readonly abortBash: () => void;
  readonly revealSession: (sessionPath: string) => void;
  /** 系统目录选择对话框；null = 取消（新会话弹窗浏览入口）。 */
  readonly pickDirectory: (defaultPath: string | null) => Promise<string | null>;
  readonly togglePinnedSession: (sessionPath: string) => void;
  /** 移除项目 = 隐藏该 cwd 的全部会话（同目录新建任务解除）。 */
  readonly removeProject: (cwd: string) => void;
  /** 项目文件清单（空查询全量 ≤200 条相对路径；cwd 须为已知会话目录）。 */
  readonly listProjectFiles: (cwd: string) => Promise<string[] | null>;
  readonly forkFromEntry: (entryId: string) => Promise<string | null>;
  readonly reloadSessionTrusted: (threadId: string, trusted: boolean) => void;
  readonly steerSubagent: (subagentId: string, message: string) => void;
  readonly restartHost: () => void;
  /** 指定线程停止当前轮（运行状态页执行中行的停止操作；活跃线程走 stopActiveTurn）。 */
  readonly stopThread: (threadId: string) => void;
  /** 运行状态快照（T29 监控页轮询；失败 null 保持旧值）。 */
  readonly fetchRuntime: () => Promise<RuntimeSnapshotView | null>;
  /** 宿主 stderr 尾部（按需）。 */
  readonly fetchDiagnosticLog: () => Promise<string | null>;
  /** 手动/强制回收（失败推通知条）。 */
  readonly retireSession: (threadId: string) => Promise<void>;
  readonly forceRetireSession: (threadId: string) => Promise<void>;
  /** 常驻开关（失败推通知条）。 */
  readonly setKeepalive: (threadId: string, keepalive: boolean) => Promise<void>;
  /** 闲置回收档位（失败推通知条）。 */
  readonly setIdleRecycle: (minutes: IdleRecycleMinutes) => Promise<void>;
  /** 诊断包导出；失败推通知条，返回是否成功（成功提示由调用方给）。 */
  readonly exportDiagnostics: () => Promise<boolean>;
  /** 历史水化失败的重试（活跃会话全量重拉）。 */
  readonly retryHydration: () => void;
  /** 打开 Usage 页时对全部活跃线程补拉 stats（防未访问会话显示 0）。 */
  readonly refreshAllStats: () => void;
  /** 通用通知（bash 携图拒绝等接线层提示）。 */
  readonly showNotice: (text: string) => void;
  /** J2 通用偏好保存（trustedDefault / 宿主路径）。 */
  readonly saveGeneralPreferences: (patch: { trustedDefault?: boolean }) => Promise<boolean>;
  readonly testProvider: (name: string, modelId: string | undefined) => Promise<{ ok: true; latencyMs: number } | { ok: false; reason: string }>;
  readonly upsertProvider: (input: { name: string; baseUrl: string; api: string; models: ProviderModel[]; thinkingFormat?: ThinkingFormat; apiKey?: string }) => Promise<boolean>;
  readonly removeProvider: (name: string) => Promise<boolean>;
  readonly renameSession: (threadId: string, name: string) => Promise<boolean>;
  /** 归档：关闭会话（文件保留）+ archivedSessions 偏好标记；侧栏与历史默认隐藏。 */
  readonly archiveSession: (threadId: string) => void;
  /** 取消归档（设置页历史分区恢复入口）。 */
  readonly unarchiveSession: (sessionPath: string) => void;
  /** 在系统工具中打开已知项目目录（访达/终端/编辑器）；失败走通知条。 */
  readonly openInSystem: (cwd: string, target: 'finder' | 'terminal' | 'editor') => Promise<void>;
  /** 剪贴板写入（复制路径/会话 ID）；失败走通知条。 */
  readonly copyText: (text: string) => Promise<boolean>;
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

/** 新会话模型选择链（调用时读 store 真相）：项目记忆 → 全局默认 → 当前会话 → 首个可用。 */
function defaultModelKey(cwd: string): string {
  const state = store.getState();
  const active = state.activeThreadId !== null ? state.sessions[state.activeThreadId] : undefined;
  const firstModel = state.models[0];
  const fallback = firstModel !== undefined ? `${firstModel.provider}/${firstModel.modelId}` : '';
  const picked = pickSessionModel(
    state.models,
    state.preferences.projectModels[cwd] ?? state.preferences.defaultModel,
    active?.model ?? fallback,
  );
  return picked !== undefined ? `${picked.provider}/${picked.modelId}` : '';
}

/** 投递失败通知口径：宿主桥不可用不弹（横幅已显式呈现），恢复失败用专项文案。 */
function notifySubmitFailure(reason: string | null): void {
  if (reason === null || reason === 'bridge_unavailable') return;
  pushNotice(reason === 'resume_failed' ? copy.flow.resumeFailed : copy.flow.sendFailed(reason));
}

export function createWorkspaceActions(): WorkspaceActions {
  /** 建会话的共用路径（新会话入口与新建任务页首条提交）：失败推通知条，成功解除项目隐藏。 */
  const openSession = async (input: {
    cwd: string
    trusted?: boolean
    model?: string
    thinkingLevel?: string
    permissionMode?: PermissionRules['mode']
  }): Promise<{ ok: true; threadId: string } | { ok: false }> => {
    const model = parseModelKey(input.model ?? defaultModelKey(input.cwd));
    const outcome = await controller.createSession({
      cwd: input.cwd,
      trusted: input.trusted,
      model: model ?? undefined,
      thinkingLevel: input.thinkingLevel,
      permissionMode: input.permissionMode,
    });
    if (!outcome.ok) {
      pushNotice(copy.newTask.createFailed(outcome.reason));
      return { ok: false };
    }
    // 同目录新建任务 = 解除项目隐藏（移除项目的恢复通路）
    const hidden = store.getState().preferences.hiddenProjects;
    if (hidden.includes(input.cwd)) {
      void controller.updatePreferences({ hiddenProjects: hidden.filter((path) => path !== input.cwd) });
    }
    return { ok: true, threadId: outcome.threadId };
  };

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
      notifySubmitFailure(reason);
      return reason;
    },
    submitThreadDraft: async (threadId, message, images, mode) => {
      const reason = await controller.submitDraft(threadId, message, images, mode);
      notifySubmitFailure(reason);
      return reason;
    },
    stopActiveTurn: () => void controller.stopActiveTurn(activeThreadOf()),
    selectSession: (threadId) => controller.selectSession(threadId),
    createSession: async (input) => (await openSession(input)).ok,
    startTask: async (input) => {
      const created = await openSession({
        cwd: input.cwd,
        trusted: input.trusted,
        model: input.model,
        thinkingLevel: input.thinkingLevel ?? undefined,
        permissionMode: input.permissionMode ?? undefined,
      });
      if (!created.ok) return { ok: false };
      // 首条消息投递：失败不撤销会话（threadId 已返回，调用方把文本回填草稿槽）
      const reason = await controller.submitDraft(created.threadId, input.text, input.images);
      notifySubmitFailure(reason);
      return { ok: true, threadId: created.threadId, sendFailed: reason !== null };
    },
    defaultModelFor: (cwd) => defaultModelKey(cwd),
    openSavedSession: (sessionPath) => controller.openSavedSession(sessionPath),
    closeSession: (threadId) => void controller.closeSession(threadId),
    selectEffort: (value: string) => {
      void controller.selectThinking(activeThreadOf(), thinkingLevelOfLabel(value));
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
    refreshModels: () => void controller.refreshModels(),
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
    restartOnboarding: async () => {
      const next = await controller.updatePreferences({ onboarded: false });
      if (next === null) {
        pushNotice(copy.settings.preferenceSaveFailed);
        return false;
      }
      return true;
    },
    testProvider: (name, modelId) => controller.testProvider(name, modelId),
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
    refreshAllStats: () => {
      // stats 是 worker 级查询：parked 会话不发（会唤醒全部 worker——T27 预算），
      // 只刷新 live 会话，parked 显示最后已知值
      for (const threadId of statsTargetsOf(store.getState().sessions)) {
        void controller.refreshStats(threadId);
      }
    },
    retryHydration: () => {
      // 历史水化失败态的重试入口：force 越过 hydrated 守卫（reconcile/rebuild 的
      // 失败可发生在已水化线程上，无 force 的重试会被守卫吞掉）
      const active = store.getState().activeThreadId;
      if (active !== null) void controller.ensureHydrated(active, { force: true });
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
    stopThread: (threadId) => void controller.stopActiveTurn(threadId),
    fetchRuntime: () => controller.runtime.fetchRuntimeSnapshot(),
    fetchDiagnosticLog: () => controller.runtime.fetchDiagnosticLog(),
    retireSession: async (threadId) => {
      const reason = await controller.runtime.retireSession(threadId);
      if (reason !== null) pushNotice(copy.runtime.recycleFailed);
    },
    forceRetireSession: async (threadId) => {
      const reason = await controller.runtime.forceRetireSession(threadId);
      if (reason !== null) pushNotice(copy.runtime.recycleFailed);
    },
    setKeepalive: async (threadId, keepalive) => {
      const reason = await controller.runtime.setKeepalive(threadId, keepalive);
      if (reason !== null) pushNotice(copy.runtime.keepaliveFailed);
    },
    setIdleRecycle: async (minutes) => {
      const applied = await controller.runtime.setIdleRecycle(minutes);
      if (applied === null) pushNotice(copy.runtime.recycleSettingFailed);
    },
    exportDiagnostics: async () => {
      const directory = await controller.runtime.exportDiagnostics();
      if (directory === null) {
        pushNotice(copy.runtime.exportFailed);
        return false;
      }
      return true;
    },
    reloadSessionTrusted: (threadId, trusted) => {
      void controller.reloadSessionTrusted(threadId, trusted).then((ok) => {
        if (!ok) pushNotice(copy.thread.reloadTrustFailed);
      });
    },
    refreshAgentDefinitions: () => {
      void controller.refreshAgentDefinitions();
    },
    upsertAgentDefinition: (definition, previous) => controller.upsertAgentDefinition(definition, previous),
    removeAgentDefinition: (key) => controller.removeAgentDefinition(key),
    refreshSkills: () => {
      void controller.refreshSkills();
    },
    fetchCommandPreview: () => controller.fetchCommandPreview(),
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
    searchFilesIn: (cwd, query) => controller.searchFiles(cwd, query),
    listGitBranches: (cwd) => controller.listGitBranches(cwd),
    checkoutGitBranch: (cwd, branch, create) => controller.checkoutGitBranch(cwd, branch, create),
    runBash: async (command) => {
      const reason = await controller.runBash(activeThreadOf(), command);
      if (reason !== null) pushNotice(copy.flow.bashFailed(reason));
      return reason;
    },
    abortBash: () => void controller.abortBash(activeThreadOf()),
    revealSession: (sessionPath) => void controller.revealSession(sessionPath),
    pickDirectory: async (defaultPath) => {
      const outcome = await bridgeClient.invoke('dialog/pickDirectory', defaultPath !== null ? { defaultPath } : {});
      if (!outcome.ok) {
        // 失败与取消区分：取消静默，失败要给用户反馈（通知条层级高于弹窗）
        pushNotice(copy.newTask.pickFailed);
        return null;
      }
      return outcome.data;
    },
    removeProject: (cwd) => {
      const current = store.getState().preferences.hiddenProjects;
      if (current.includes(cwd)) return;
      void controller.updatePreferences({ hiddenProjects: [...current, cwd] }).then((next) => {
        if (next === null) pushNotice(copy.settings.preferenceSaveFailed);
      });
    },
    listProjectFiles: (cwd) => bridgeClient.invoke('file/search', { cwd, query: '' }).then((outcome) => {
      if (!outcome.ok) return null;
      return outcome.data;
    }),
    archiveSession: (threadId) => {
      // 先落偏好再关会话：关闭是 fire-and-forget，若先关，标记失败会话已从侧栏消失且无归档记录
      const session = store.getState().sessions[threadId];
      const sessionPath = session?.sessionPath ?? '';
      if (sessionPath.length > 0) {
        const current = store.getState().preferences.archivedSessions;
        if (!current.includes(sessionPath)) {
          void controller.updatePreferences({ archivedSessions: [...current, sessionPath] }).then((next) => {
            if (next === null) pushNotice(copy.settings.preferenceSaveFailed);
          });
        }
      }
      void controller.closeSession(threadId);
    },
    unarchiveSession: (sessionPath) => {
      const current = store.getState().preferences.archivedSessions;
      if (!current.includes(sessionPath)) return;
      void controller.updatePreferences({ archivedSessions: current.filter((path) => path !== sessionPath) }).then((next) => {
        if (next === null) pushNotice(copy.settings.preferenceSaveFailed);
      });
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
      const outcome = await controller.forkSession(activeThreadOf(), entryId);
      if (!outcome.ok) {
        // 扩展拦截不是瞬时故障：重试无意义，文案与「请重试」区分
        pushNotice(outcome.reason === 'fork_cancelled' ? copy.flow.forkCancelled : copy.flow.forkFailed);
        return null;
      }
      return outcome.threadId;
    },
    upsertProvider: (input) => controller.upsertProvider(input),
    removeProvider: (name) => controller.removeProvider(name),
    renameSession: async (threadId, name) => {
      const ok = await controller.renameSession(threadId, name);
      if (!ok) pushNotice(copy.sidebar.renameFailed);
      return ok;
    },
    openInSystem: async (cwd, target) => {
      if (cwd.length === 0) return;
      const outcome = await bridgeClient.invoke('shell/open', { cwd, target });
      if (!outcome.ok) {
        pushNotice(outcome.reason === 'editor_not_found' ? copy.thread.openEditorMissing : copy.thread.openFailed(outcome.reason));
      }
    },
    copyText: async (text) => {
      const ok = await writeClipboard(text);
      if (!ok) pushNotice(copy.thread.copyFailed);
      return ok;
    },
    steerSubagent: (subagentId, message) => {
      void controller.steerSubagent(activeThreadOf(), subagentId, message).then((reason) => {
        if (reason !== null) pushNotice(copy.flow.steerFailed(reason));
      });
    },
  };
}
