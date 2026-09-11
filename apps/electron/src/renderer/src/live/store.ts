import { createStore } from 'zustand/vanilla';

import type {
  AgentDefinition,
  PendingDialogView,
  SubagentSnapshotView,
  CommandView,
  SessionStatsView,
  SkillView,
  ApiData,
  ModelInfoView,
  PermissionRules,
  PreferencesView,
  ProviderConfigView,
  SavedSessionView,
  SessionView,
  UiEvent,
} from '@paiapp/contracts';
import type { SubagentModel, ThreadModel } from '@/thread/thread-model';

import { strListField } from '@paiapp/adapter';
import { foldDeath, foldStopIntent, foldThreadEvent } from './fold-events';
import { foldHydrate } from './fold-hydrate';
import { initialThreadState, type HydrateAction, type LiveThreadState } from './live-thread-state';

/**
 * 渲染层全局 store（zustand vanilla + 组件经 useStore 选择器订阅）。
 * store 只做状态容器与折叠派发；副作用（invoke/对账拉取）在 controller。
 */

export type PendingDialog = {
  requestId: string;
  threadId: string;
  method: string;
  title?: string;
  message?: string;
  options?: string[];
  placeholder?: string;
  prefill?: string;
  subagentId?: string;
  agent?: string;
};

export interface LiveStoreState {
  hostPhase: 'starting' | 'ready' | 'restarting' | 'failed' | null;
  bootstrapLoaded: boolean;
  bootstrapError: string | null;
  sessions: Readonly<Record<string, SessionView>>;
  saved: readonly SavedSessionView[];
  models: readonly ModelInfoView[];
  providers: readonly ProviderConfigView[];
  /** 应用偏好（默认模型 / 引导完成标志）。 */
  preferences: PreferencesView;
  /** 全局权限规则（null = 未加载；设置页打开时拉取）。 */
  permissionRules: PermissionRules | null;
  /** 会话级规则（null = 未加载）。 */
  sessionRules: { rules: PermissionRules; source: 'thread' | 'global' } | null;
  /** 子 agent 定义管理面（文件真相；进 Agents 分区时拉取）。 */
  agentDefinitions: readonly AgentDefinition[];
  /** 用户级技能目录（进技能分区时拉取；启停真相在 pi settings）。 */
  skills: readonly SkillView[];
  /** 活跃会话的斜杠命令目录（`/` 补全数据源；拉取 effect 写入，切会话同步清空）。 */
  commands: readonly CommandView[];
  /** 活跃会话的思考档位（协议档位值；拉取 effect 写入，切会话同步清空）。 */
  effortLevels: readonly string[];
  threads: Readonly<Record<string, LiveThreadState>>;
  /** 挂起对话框队列（入队序即呈现序；数组本身即真相，无伴生索引）。 */
  dialogs: readonly PendingDialog[];
  activeThreadId: string | null;
  stats: Readonly<Record<string, SessionStatsView>>;
  /** 通知条（notify/setStatus 类对话框的瞬时呈现）。 */
  notices: readonly { id: string; text: string }[];
}

export interface LiveStoreActions {
  applyEvent(event: UiEvent, now: number): void;
  hydrate(threadId: string, action: HydrateAction): void;
  /** 子代理快照合入（T35 M2b 收敛读口）：按 subagentId 合并（快照为权威态），本地缺的补建、本地有而快照无的保留。 */
  hydrateSubagents(threadId: string, snapshot: readonly SubagentSnapshotView[], now: number): void;
  /** 待答弹窗合入（T35 M2b 收敛读口）：按 requestId 合并（快照权威），**只增不删**——
   * 快照读取与应用之间存在在途窗口，凭快照删除会复活刚结算的弹窗；删除只走 dialogSettled。 */
  hydrateDialogs(snapshot: readonly PendingDialogView[]): void;
  /** fork 换轨后旧线程运行面终态化（streaming/queue 镜像不再有事件驱动收敛）。 */
  parkThread(threadId: string): void;
  stopIntent(threadId: string): void;
  bootstrap(data: ApiData<'app/bootstrap'>): void;
  bootstrapFailed(reason: string): void;
  setActiveThread(threadId: string | null): void;
  updateStats(threadId: string, stats: SessionStatsView): void;
  /** 直执行 bash 开始/结束（流式尾部经 bashOutput 事件折叠）。 */
  bashStarted(threadId: string): void;
  bashSettled(threadId: string): void;
  /** 通知条追加（保留最近 5 条；controller/actions 共用的单一入口）。 */
  pushNotice(text: string): void;
  dismissNotice(id: string): void;
  reset(): void;
}

export type LiveStore = ReturnType<typeof createLiveStore>;

export function createLiveStore() {
  const store = createStore<LiveStoreState & LiveStoreActions>()((set) => {
    const threadOf = (state: LiveStoreState, threadId: string): LiveThreadState => state.threads[threadId] ?? initialThreadState;

    return {
      ...initialStoreState(),
      applyEvent(event, now) {
        set((state) => {
          switch (event.type) {
            case 'host': {
              if (event.phase !== 'restarting' && event.phase !== 'failed') return { hostPhase: event.phase };
              // 宿主进程死亡（挂死重启/启动失败）：全部线程的运行面随进程消亡且不会再有任何事件，
              // 就地终态防 streaming/queue 镜像滞留（滞留会把空闲会话的新消息投进永不消费的队列）；
              // 挂起对话框同随进程消亡（ui_response 永无回执，滞留只等 5 分钟兜底超时）。
              // hydrated/hydrateFailed 一并失效：对账回落后（同 threadId）旧数据可能
              // 落后于盘上会话，被再次激活时须重拉全量；旧失败标志属旧世代，不得残留
              // 误呈「历史加载失败」空态
              const threads: Record<string, LiveThreadState> = {};
              for (const [threadId, thread] of Object.entries(state.threads)) {
                threads[threadId] = { ...foldDeath(thread, now), crashed: true, hydrated: false, hydrateFailed: false };
              }
              return { hostPhase: event.phase, threads, dialogs: [] };
            }
            case 'sessionUpdated':
              return { sessions: { ...state.sessions, [event.session.threadId]: event.session } };
            case 'sessionRenamed': {
              const session = state.sessions[event.threadId];
              if (session === undefined) return state;
              return { sessions: { ...state.sessions, [event.threadId]: { ...session, title: event.name ?? session.title } } };
            }
            case 'sessionRemoved': {
              const doomed = state.sessions[event.threadId];
              if (doomed === undefined) return state;
              const sessions = omitKey(state.sessions, event.threadId);
              const threads = omitKey(state.threads, event.threadId);
              const stats = omitKey(state.stats, event.threadId);
              // 线程已移除，挂起对话框永无应答对象：随行收走（与 sessionDied/host 同口径）
              const dialogs = state.dialogs.filter((dialog) => dialog.threadId !== event.threadId);
              let activeThreadId = state.activeThreadId;
              if (activeThreadId === event.threadId) {
                // 换 id 整行替换（resume/fork）时优先回落到同会话文件的新 id，避免闪跳到无关会话
                const successor =
                  doomed.sessionPath !== null
                    ? Object.values(sessions).find((session) => session.sessionPath === doomed.sessionPath)
                    : undefined;
                activeThreadId = successor?.threadId ?? firstSessionId(sessions);
              }
              return { sessions, threads, stats, dialogs, ...activeThreadFlip(state, activeThreadId) };
            }
            case 'sessionDied': {
              const thread = threadOf(state, event.threadId);
              // 该 worker 的挂起对话框随进程消亡：立即收起，不等 5 分钟兜底超时
              const dialogs = state.dialogs.filter((dialog) => dialog.threadId !== event.threadId);
              return { threads: { ...state.threads, [event.threadId]: foldThreadEvent(thread, event, now) }, dialogs };
            }
            case 'sessionParked': {
              const thread = threadOf(state, event.threadId);
              const session = state.sessions[event.threadId];
              const dialogs = state.dialogs.filter((dialog) => dialog.threadId !== event.threadId);
              return {
                // 会话视图经 sessionUpdated(parked) 折叠；此处兜底幂等置 parked（事件乱序安全）
                sessions: session === undefined || session.state === 'parked' ? state.sessions : { ...state.sessions, [event.threadId]: { ...session, state: 'parked', streaming: false } },
                threads: { ...state.threads, [event.threadId]: foldThreadEvent(thread, event, now) },
                dialogs,
              };
            }
            case 'dialogRequest': {
              if (event.method === 'notify') {
                const text = event.message ?? event.title ?? '';
                if (text.length === 0) return state;
                // 与 dialog 路径对称：同 requestId 重投去重
                const deduped = state.notices.filter((notice) => notice.id !== event.requestId);
                return { notices: [...deduped.slice(-4), { id: event.requestId, text }] };
              }
              if (event.method === 'setStatus') return state;
              const dialogs = [...state.dialogs.filter((dialog) => dialog.requestId !== event.requestId), toPendingDialog(event)];
              return { dialogs };
            }
            case 'dialogSettled': {
              if (!state.dialogs.some((dialog) => dialog.requestId === event.requestId)) return state;
              return { dialogs: state.dialogs.filter((dialog) => dialog.requestId !== event.requestId) };
            }
            default: {
              const threadId = (event as { threadId?: string }).threadId;
              if (typeof threadId !== 'string' || threadId.length === 0) return state;
              return { threads: { ...state.threads, [threadId]: foldThreadEvent(threadOf(state, threadId), event, now) } };
            }
          }
        });
      },
      hydrateSubagents(threadId, snapshot, now) {
        if (snapshot.length === 0) return;
        set((state) => {
          const agents = [...(state.threads[threadId]?.agents ?? [])];
          for (const entry of snapshot) {
            const index = agents.findIndex((agent) => agent.id === entry.subagentId);
            const base: SubagentModel =
              index === -1
                ? { id: entry.subagentId, name: entry.agent, agentType: entry.agent, model: '', effort: '', tokens: null, toolCount: 0, status: 'working', startedAt: Math.max(0, now - entry.elapsedMs), endedAt: null, summary: '', tools: [] }
                : (agents[index] as SubagentModel);
            const merged: SubagentModel = {
              ...base,
              name: entry.agent.length > 0 ? entry.agent : base.name,
              agentType: entry.agent.length > 0 ? entry.agent : base.agentType,
              status: toSubagentStatus(entry.status),
              endedAt: entry.status === 'running' || entry.status === 'queued' ? null : base.endedAt ?? now,
              summary: entry.output.length > 0 ? entry.output : base.summary,
            };
            if (index === -1) agents.push(merged);
            else agents[index] = merged;
          }
          return { threads: { ...state.threads, [threadId]: { ...threadOf(state, threadId), agents } } };
        });
      },
      hydrateDialogs(snapshot) {
        if (snapshot.length === 0) return;
        set((state) => {
          let dialogs = state.dialogs;
          for (const entry of snapshot) {
            const mapped = toPendingDialogFromView(entry);
            dialogs = [...dialogs.filter((dialog) => dialog.requestId !== mapped.requestId), mapped];
          }
          return { dialogs };
        });
      },
      hydrate(threadId, action) {
        set((state) => {
          // 幽灵守卫：会话已移除（重开/停止后迟到的对账定时器）不再在 threads 表复活条目
          if (threadId !== state.activeThreadId && !(threadId in state.sessions)) return state;
          return { threads: { ...state.threads, [threadId]: foldHydrate(threadOf(state, threadId), action) } };
        });
      },
      parkThread(threadId) {
        set((state) => {
          const thread = state.threads[threadId];
          if (thread === undefined) return state;
          // fork 换轨：旧 id 不再有任何事件，运行面就地终态防 streaming/queue 镜像滞留；
          // parked 标志让轮结算侦测（排队冲刷）把这次翻转排除在「自然结算」外
          return { threads: { ...state.threads, [threadId]: { ...foldDeath(thread, Date.now()), parked: true } } };
        });
      },
      stopIntent(threadId) {
        set((state) => ({ threads: { ...state.threads, [threadId]: foldStopIntent(threadOf(state, threadId)) } }));
      },
      bootstrap(data) {

        set((state) => {
          // 滞后快照合并语义：快照补缺、不清在途（事件流可能先于 bootstrap 建立更新的会话/字段）
          const sessions: Record<string, SessionView> = { ...state.sessions };
          for (const session of data.sessions) {
            sessions[session.threadId] = sessions[session.threadId] ?? session;
          }
          const threads: Record<string, LiveThreadState> = {};
          for (const threadId of Object.keys(sessions)) {
            threads[threadId] = state.threads[threadId] ?? initialThreadState;
          }
          const activeThreadId =
            state.activeThreadId !== null && state.activeThreadId in sessions ? state.activeThreadId : firstSessionId(sessions);
          return {
            // 活跃线程翻转（bootstrap 回落）同样清会话级视图，与 setActiveThread 同语义
            ...activeThreadFlip(state, activeThreadId),
            bootstrapLoaded: true,
            bootstrapError: null,
            sessions,
            saved: data.saved,
            models: data.models,
            providers: data.providers,
            // 偏好整体替换：bootstrap 只在启动时发生一次，晚于它写入的偏好不会被回滚；
            // 若未来引入重连 re-bootstrap，需改为字段级合并（滞后快照可能覆盖本地新写值）
            preferences: data.preferences,
            // 宿主相位滞后合并：缓冲事件先到（如 host failed）不被启动快照回滚
            hostPhase: state.hostPhase ?? data.hostPhase,
            threads,
            activeThreadId,
          };
        });
      },
      bootstrapFailed(reason) {
        set({ bootstrapLoaded: true, bootstrapError: reason });
      },
      setActiveThread(threadId) {
        // 同值重设不失效（effect 以 activeThreadId 为 deps，不会重拉）；翻转语义见 activeThreadFlip
        set((state) => activeThreadFlip(state, threadId));
      },
      updateStats(threadId, stats) {
        set((state) => ({ stats: { ...state.stats, [threadId]: stats } }));
      },
      bashStarted(threadId) {
        set((state) => ({ threads: { ...state.threads, [threadId]: { ...threadOf(state, threadId), bashRunning: true, bashTail: '' } } }));
      },
      bashSettled(threadId) {
        set((state) => ({ threads: { ...state.threads, [threadId]: { ...threadOf(state, threadId), bashRunning: false, bashTail: '' } } }));
      },
      pushNotice(text) {
        set((state) => ({ notices: [...state.notices.filter((notice) => notice.text !== text).slice(-4), { id: `notice-${(noticeSeq += 1)}`, text }] }));
      },
      dismissNotice(id) {
        set((state) => ({ notices: state.notices.filter((notice) => notice.id !== id) }));
      },
      reset() {
        set(initialStoreState());
      },
    };
  });
  return store;
}

/** 模型缓存 key = 折叠态引用：不可变更新保证「引用不变 ⇒ 内容不变」，
 * 后台线程/无关字段的 set 不再让活跃线程模型换引用（消息流 memo 的命中前提）。 */
const threadModelCache = new WeakMap<LiveThreadState, ThreadModel>();

export function threadModelOf(state: LiveStoreState, threadId: string): ThreadModel {
  const thread = state.threads[threadId] ?? initialThreadState;
  const cached = threadModelCache.get(thread);
  if (cached?.sessionId === threadId) return cached;
  const model: ThreadModel = { sessionId: threadId, items: thread.items, agents: thread.agents };
  threadModelCache.set(thread, model);
  return model;
}

/** 通知条 id 单调序列（避免同毫秒碰撞；dismiss 按 id 定位）。 */
let noticeSeq = 0;

function toPendingDialog(event: DialogViewSource): PendingDialog {
  return {
    requestId: event.requestId,
    threadId: event.threadId,
    method: event.method,
    title: event.title,
    message: event.message,
    options: event.options,
    placeholder: event.placeholder,
    prefill: event.prefill,
    subagentId: event.subagentId,
    agent: event.agent,
  };
}

type DialogViewSource = Extract<UiEvent, { type: 'dialogRequest' }>;

/** 子代理快照状态 → 面板状态（registry 词表 → 视图词表「working/done」）。 */
function toSubagentStatus(status: SubagentSnapshotView['status']): SubagentModel['status'] {
  return status === 'running' || status === 'queued' ? 'working' : 'done';
}

/** 待答弹窗视图 → store 形状（与 dialogRequest 事件同一套字段收窄）。 */
function toPendingDialogFromView(entry: PendingDialogView): PendingDialog {
  const payload = entry.payload;
  const str = (value: unknown): string | undefined => (typeof value === 'string' ? value : undefined);
  // 与实时帧同一套收窄（strListField）：对象形态 {label,value} 的选项重建后不得消失
  const options = strListField(payload['options']);
  return {
    requestId: entry.requestId,
    threadId: entry.threadId,
    method: entry.method,
    title: str(payload['title']),
    message: str(payload['message']),
    options,
    placeholder: str(payload['placeholder']),
    prefill: str(payload['prefill']),
    subagentId: str(payload['subagentId']),
    agent: str(payload['agent']),
  };
}

function omitKey<T>(source: Readonly<Record<string, T>>, key: string): Record<string, T> {
  const out: Record<string, T> = {};
  for (const [name, value] of Object.entries(source)) {
    if (name !== key) out[name] = value;
  }
  return out;
}

/**
 * 活跃线程翻转时的会话级视图失效补丁：sessionRules/commands/effortLevels 是活跃
 * 会话的视图，翻转即同步清空（防旧会话的规则/补全目录在操作栏残留一帧；新值由
 * 切会话 effect 重拉）。全部翻转路径（setActiveThread / sessionRemoved 继任者
 * 回落 / bootstrap 回落）必须经此，禁止直写 activeThreadId 不带补丁。
 */
function activeThreadFlip(state: LiveStoreState, threadId: string | null) {
  return state.activeThreadId === threadId
    ? {}
    : { activeThreadId: threadId, sessionRules: null, commands: [] as const, effortLevels: [] as const };
}

function firstSessionId(sessions: Readonly<Record<string, SessionView>>): string | null {
  const ids = Object.keys(sessions);
  return ids.length > 0 ? (ids[0] ?? null) : null;
}

function initialStoreState(): LiveStoreState {
  return {
    hostPhase: null,
    bootstrapLoaded: false,
    bootstrapError: null,
    sessions: {},
    saved: [],
    models: [],
    providers: [],
    agentDefinitions: [],
    skills: [],
    commands: [],
    effortLevels: [],
    preferences: { defaultModel: null, onboarded: false, projectModels: {}, pinnedSessions: [], trustedDefault: false, hiddenProjects: [], idleRecycleMinutes: 5, archivedSessions: [] },
    permissionRules: null,
    sessionRules: null,
    threads: {},
    dialogs: [],
    activeThreadId: null,
    stats: {},
    notices: [],
  };
}
