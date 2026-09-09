import * as React from 'react';

import type { AgentDefinition, CommandView, PermissionRules, PreferencesView, ProviderConfigView, SessionStatsView, SessionView, SkillView } from '@paiapp/contracts';
import { useStore } from 'zustand';

import type { SessionCardModel } from '@/sidebar/session-card-model';
import type { ThreadModel } from '@/thread/thread-model';
import { collectThreadDiff } from '@/diff-panel/collect-thread-diff';
import { summarizeAgents } from '@/thread/panel-summary';
import { baseNameOf } from '@/lib/project-dirs';
import { imagePayloadOf } from '@/composer/read-image-file';
import { queuedDrafts, type QueuedDraft, type QueuedDraftSubmit } from '@/composer/queued-drafts';
import { connectQueuedDraftFlush } from './queued-flush';

import type { WorkspaceActions, WorkspaceDiagnostics } from './workspace-actions';
import { createWorkspaceActions } from './workspace-actions';
import { bridgeClient, controller, store } from './workspace-runtime';
import { threadModelOf, type LiveStoreState, type PendingDialog } from './store';

/**
 * live 工作区装配的 React 订阅面：细粒度 selector 订阅（store 任何 set 只让
 * 受影响字段的订阅者重渲——后台线程事件不再驱动整棵工作区树）；
 * 动作全部经稳定 actions（workspace-actions），本 hook 不再生产闭包。
 * 生产装配唯一入口（demo 装配只服务组件测试夹具）。
 */

export type ComposerSelection = {
  model: string;
  modelOptions: readonly string[];
  effort: string;
  effortOptions: readonly string[];
  contextUsed: number;
};

export type LiveWorkspaceView = {
  ready: boolean;
  bootstrapError: string | null;
  bridgeAvailable: boolean;
  hostPhase: LiveStoreState['hostPhase'];
  sessions: readonly SessionCardModel[];
  activeThreadId: string;
  activeThread: ThreadModel;
  /** 当前会话工作目录（新会话缺省值）。 */
  activeCwd: string;
  generating: boolean;
  /** 对话执行中（streaming/直执行命令/压缩）：消息流尾部 loading 数据源。 */
  executing: boolean;
  agentsActive: boolean;
  /** 工作中子代理数量（输入框徽标数据源；agentsActive 同源）。 */
  agentsWorking: number;
  queueCount: number;
  /** 排队消息分组视图（hub 侧队列镜像；横幅计数数据源）。 */
  queueItems: { steering: readonly string[]; followUp: readonly string[] };
  /** 本地暂存排队消息（按线程；输入卡顶部卡片堆数据源，轮末自动冲刷）。 */
  queuedDrafts: Readonly<Record<string, readonly QueuedDraft[]>>;
  /** 暂存投递（立即改向/冲刷共用；调用时读 store 真相寻址线程）。 */
  submitQueuedDraft: QueuedDraftSubmit;
  /** 调用时读 store 真相的流式判定（提交路径不得用渲染帧快照判生成中）。 */
  isThreadStreaming: (threadId: string) => boolean;
  crashed: boolean;
  compacting: boolean;
  /** 直执行 bash 在途与其流式输出尾部。 */
  bashRunning: boolean;
  bashTail: string;
  retrying: { attempt: number; maxAttempts: number } | null;
  hydrateFailed: boolean;
  now: number;
  threadDiff: ReturnType<typeof collectThreadDiff>;
  /** 当前会话用量明细（I1 popover 数据源）。 */
  activeStats: SessionStatsView | null;
  /** 各会话用量快照（I2 聚合数据源）。 */
  statsById: Readonly<Record<string, SessionStatsView>>;
  /** 运行时诊断（M1 分区数据源；null = 未拉取）。 */
  diagnostics: WorkspaceDiagnostics | null;
  composer: ComposerSelection;
  dialogs: readonly PendingDialog[];
  notices: readonly { id: string; text: string }[];
  saved: ReadonlyArray<{ sessionPath: string; title: string; cwd: string; modifiedAt: number; messageCount: number }>;
  providers: readonly ProviderConfigView[];
  /** 当前会话的斜杠命令/技能目录（补全数据源）。 */
  commands: readonly CommandView[];
  /** 子 agent 定义管理面（文件真相；进 Agents 分区时拉取）。 */
  agentDefinitions: readonly AgentDefinition[];
  /** 用户级技能目录（含启用态；进技能分区时拉取）。 */
  skills: readonly SkillView[];
  preferences: PreferencesView;
  /** 全局权限规则（null = 未加载）。 */
  permissionRules: PermissionRules | null;
  /** 会话级规则（null = 未加载；source=thread 表示存在 sidecar）。 */
  sessionRules: { rules: PermissionRules; source: 'thread' | 'global' } | null;
  thinkingLevels: readonly string[];
  actions: WorkspaceActions;
};

const EFFORT_LABELS: Readonly<Record<string, string>> = {
  off: 'Off',
  minimal: 'Minimal',
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  xhigh: 'X-high',
  max: 'Max',
};

const EMPTY_QUEUE: { steering: readonly string[]; followUp: readonly string[] } = { steering: [], followUp: [] };

/** useSyncExternalStore 订阅句柄：引用恒定（queuedDrafts 是模块单例）。 */
const subscribeQueuedDrafts = (listener: () => void): (() => void) => queuedDrafts.subscribe(listener);

export function useLiveWorkspace(): LiveWorkspaceView {
  const [now, setNow] = React.useState(() => Date.now());
  const [effortLevels, setEffortLevels] = React.useState<readonly string[]>([]);
  const [commands, setCommands] = React.useState<readonly CommandView[]>([]);
  const [diagnostics, setDiagnostics] = React.useState<WorkspaceDiagnostics | null>(null);
  const actions = React.useMemo(() => createWorkspaceActions(setDiagnostics), []);

  const hostPhase = useStore(store, (s) => s.hostPhase);
  const bootstrapLoaded = useStore(store, (s) => s.bootstrapLoaded);
  const bootstrapError = useStore(store, (s) => s.bootstrapError);
  const sessions = useStore(store, (s) => s.sessions);
  const savedRaw = useStore(store, (s) => s.saved);
  const models = useStore(store, (s) => s.models);
  const providers = useStore(store, (s) => s.providers);
  const preferences = useStore(store, (s) => s.preferences);
  const permissionRules = useStore(store, (s) => s.permissionRules);
  const sessionRules = useStore(store, (s) => s.sessionRules);
  const agentDefinitions = useStore(store, (s) => s.agentDefinitions);
  const skills = useStore(store, (s) => s.skills);
  const stats = useStore(store, (s) => s.stats);
  const notices = useStore(store, (s) => s.notices);
  const dialogs = useStore(store, (s) => s.dialogs);
  const activeThreadId = useStore(store, (s) => s.activeThreadId) ?? '';
  // 活跃线程折叠态：后台线程事件只换 threads 其他条目引用，本 selector 引用不变 → 不重渲
  const threadState = useStore(store, (s) => (s.activeThreadId === null ? undefined : s.threads[s.activeThreadId]));
  // 模型经 WeakMap 缓存（引用稳定）：无关 set 不再击穿消息流 memo
  const activeThread = useStore(store, (s) => threadModelOf(s, s.activeThreadId ?? ''));
  // 活跃会话生命周期态：parked → live 翻转（懒恢复完成）时激活 effect 需要重跑
  const activeSessionState = useStore(store, (s) => (s.activeThreadId === null ? null : s.sessions[s.activeThreadId]?.state ?? null));

  React.useEffect(() => {
    void controller.start();
    // cleanup 必须返回函数本身：立即调用形态会在挂载当帧置 disposed，
    // StrictMode 双挂载下两次 bootstrap 应答全部被丢弃——启动永久停留 loading
    return () => controller.dispose();
  }, []);

  /** 流式判定读 store 真相（引用恒定：进 submitDraft 的依赖数组，不破 Composer memo） */
  const isThreadStreaming = React.useCallback(
    (threadId: string) => store.getState().threads[threadId]?.streaming === true,
    [],
  );

  // 暂存排队消息的轮末冲刷（连接器单一真相 live/queued-flush：结算冲刷/
  // 路径宿主保留/重开改绑）。submit 引用恒定（actions 稳定）。
  const submitQueuedDraft = React.useCallback<QueuedDraftSubmit>(
    (threadId, draft, mode) =>
      actions.submitThreadDraft(
        threadId,
        draft.text,
        draft.images.length === 0 ? undefined : draft.images.map((image) => imagePayloadOf(image.payload)),
        mode,
      ),
    [actions],
  );
  React.useEffect(() => connectQueuedDraftFlush(store, submitQueuedDraft), [submitQueuedDraft]);
  const queuedDraftsByThread = React.useSyncExternalStore(subscribeQueuedDrafts, queuedDrafts.snapshot);

  React.useEffect(() => {
    // 切会话（或最后一个会话被移除）先清会话级派生态，避免上一会话残留到新会话
    // （sessionRules 的清空在 store.setActiveThread 内同步完成，防渲染帧残留一帧）
    setEffortLevels([]);
    setCommands([]);
    store.setState({ agentDefinitions: [] });
    // parked 占位：懒恢复完成（state 翻转为 live）后本 effect 重跑再拉取，
    // 避免对未恢复线程发注定失败的水化/档位/命令/规则请求
    if (activeThreadId.length === 0 || activeSessionState === 'parked') return;
    void controller.ensureHydrated(activeThreadId);
    // 思考档位随会话拉取（模型能力差异；响应回来时会话已切换则丢弃）
    void bridgeClient.invoke('session/thinkingLevels', { threadId: activeThreadId }).then((outcome) => {
      if (store.getState().activeThreadId !== activeThreadId) return;
      if (outcome.ok) setEffortLevels(outcome.data.allowed);
    });
    // 斜杠命令目录随会话拉取（thread 级；同上判活）
    void bridgeClient.invoke('command/list', { threadId: activeThreadId }).then((outcome) => {
      if (store.getState().activeThreadId !== activeThreadId) return;
      if (outcome.ok) setCommands(outcome.data);
    });
    // 会话权限规则随会话拉取（操作栏模式控件数据源；判活在 controller.readSessionRules 内）
    void controller.readSessionRules(activeThreadId);
    void controller.refreshStats(activeThreadId);
  }, [activeThreadId, activeSessionState]);

  const generating = threadState?.streaming ?? false;
  const bashRunning = threadState?.bashRunning ?? false;
  const compacting = threadState?.compacting ?? false;
  /** 对话执行中（消息流尾部 loading 数据源）：轮次流式/直执行命令/压缩三种在途。
   * 清除面由折叠层保证（settle / worker 死亡 / 宿主重启均已就地终态）；
   * 后台子代理跨轮运行不并入（父轮已结算，明细归 Agents 面板）。 */
  const executing = generating || bashRunning || compacting;
  const agentsWorking = summarizeAgents(activeThread.agents).workingCount;
  const agentsActive = agentsWorking > 0;

  // 走表 tick 随「活跃线程执行中或有 working 子代理」（子代理面板计时走表依赖 now 前进；
  // 后台线程活动仍不驱动任何渲染）；已结束轮 elapsed 冻结于 endedAt，不依赖 tick
  React.useEffect(() => {
    if (!executing && !agentsActive) return;
    const handle = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(handle);
  }, [executing, agentsActive]);

  const activeSession = sessions[activeThreadId];
  const queue = threadState?.queue;
  const queueItems = queue ?? EMPTY_QUEUE;

  const composer = React.useMemo(
    () => buildComposer(models, stats, activeSession, threadState, effortLevels),
    [models, stats, activeSession, threadState, effortLevels],
  );

  return {
    ready: bootstrapLoaded,
    bootstrapError,
    bridgeAvailable: bridgeClient.available,
    hostPhase,
    sessions: React.useMemo(() => toCards(sessions), [sessions]),
    activeThreadId,
    activeThread,
    activeCwd: activeSession?.cwd ?? '',
    generating,
    executing,
    agentsActive,
    agentsWorking,
    queueCount: queueItems.steering.length + queueItems.followUp.length,
    queueItems,
    queuedDrafts: queuedDraftsByThread,
    submitQueuedDraft,
    isThreadStreaming,
    crashed: threadState?.crashed ?? false,
    compacting,
    bashRunning,
    bashTail: threadState?.bashTail ?? '',
    retrying: threadState?.retrying ?? null,
    hydrateFailed: threadState?.hydrateFailed ?? false,
    now,
    threadDiff: React.useMemo(() => collectThreadDiff(activeThread), [activeThread]),
    activeStats: stats[activeThreadId] ?? null,
    diagnostics,
    statsById: stats,
    composer,
    dialogs,
    notices,
    saved: React.useMemo(
      () =>
        savedRaw.map((session) => ({
          sessionPath: session.sessionPath,
          title: session.name ?? session.firstMessage.slice(0, 40),
          cwd: session.cwd,
          modifiedAt: session.modifiedAt,
          messageCount: session.messageCount,
        })),
      [savedRaw],
    ),
    providers,
    commands,
    agentDefinitions,
    skills,
    preferences,
    permissionRules,
    sessionRules,
    thinkingLevels: effortLevels,
    actions,
  };
}

function buildComposer(
  models: LiveStoreState['models'],
  stats: LiveStoreState['stats'],
  session: SessionView | undefined,
  thread: LiveStoreState['threads'][string] | undefined,
  effortLevels: readonly string[],
): ComposerSelection {
  const modelOptions = models.map((model) => `${model.provider}/${model.modelId}`);
  const currentModel = session?.model ?? modelOptions[0] ?? '';
  // 思考档以模型能力列表为真相：拉取前/不支持时为空，composer 侧禁用并给原因（不臆造默认档）
  const levelLabels = effortLevels.map((level) => EFFORT_LABELS[level] ?? level);
  const currentLabel = session?.thinkingLevel !== undefined && session?.thinkingLevel !== null ? EFFORT_LABELS[session.thinkingLevel] : undefined;
  // 未知档位回落到第一个可选档；无可选档时留空（触发禁用态）
  const effort = currentLabel ?? levelLabels[0] ?? '';
  return {
    model: currentModel,
    modelOptions,
    effort,
    effortOptions: levelLabels,
    contextUsed: stats[session?.threadId ?? '']?.contextUsage ?? 0,
  };
}

function toCards(sessions: Readonly<Record<string, SessionView>>): readonly SessionCardModel[] {
  return Object.values(sessions)
    .sort((a, b) => b.lastActivityAt - a.lastActivityAt)
    .map((session) => ({
      id: session.threadId,
      projectName: baseNameOf(session.cwd) || session.cwd,
      title: session.title,
      version: session.model ?? '',
      cwd: session.cwd,
      sessionPath: session.sessionPath,
      streaming: session.streaming,
      lastActivityAt: session.lastActivityAt,
    }));
}
