import { createStore } from 'zustand/vanilla';

import type {
  ApiData,
  ModelInfoView,
  ProviderConfigView,
  SavedSessionView,
  SessionView,
  UiEvent,
} from '@paiapp/contracts';
import type { ThreadModel } from '@/thread/thread-model';

import { foldHydrate, foldStopIntent, foldThreadEvent } from './fold-events';
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
  threads: Readonly<Record<string, LiveThreadState>>;
  dialogs: Readonly<Record<string, PendingDialog>>;
  dialogOrder: readonly string[];
  activeThreadId: string | null;
  stats: Readonly<Record<string, { contextUsage: number | null; tokensTotal: number }>>;
  /** 通知条（notify/setStatus 类对话框的瞬时呈现）。 */
  notices: readonly { id: string; text: string }[];
}

export interface LiveStoreActions {
  applyEvent(event: UiEvent, now: number): void;
  hydrate(threadId: string, action: HydrateAction): void;
  stopIntent(threadId: string): void;
  bootstrap(data: ApiData<'app/bootstrap'>): void;
  bootstrapFailed(reason: string): void;
  setActiveThread(threadId: string | null): void;
  updateStats(threadId: string, stats: { contextUsage: number | null; tokensTotal: number }): void;
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
            case 'host':
              return { hostPhase: event.phase };
            case 'sessionUpdated':
              return { sessions: { ...state.sessions, [event.session.threadId]: event.session } };
            case 'sessionRenamed': {
              const session = state.sessions[event.threadId];
              if (session === undefined) return state;
              return { sessions: { ...state.sessions, [event.threadId]: { ...session, title: event.name ?? session.title } } };
            }
            case 'sessionRemoved': {
              if (!(event.threadId in state.sessions)) return state;
              const sessions = omitKey(state.sessions, event.threadId);
              const threads = omitKey(state.threads, event.threadId);
              const activeThreadId = state.activeThreadId === event.threadId ? firstSessionId(sessions) : state.activeThreadId;
              return { sessions, threads, activeThreadId };
            }
            case 'sessionDied': {
              const thread = threadOf(state, event.threadId);
              return { threads: { ...state.threads, [event.threadId]: foldThreadEvent(thread, event, now) } };
            }
            case 'dialogRequest': {
              if (event.method === 'notify') {
                const text = event.message ?? event.title ?? '';
                if (text.length === 0) return state;
                return { notices: [...state.notices.slice(-4), { id: event.requestId, text }] };
              }
              if (event.method === 'setStatus') return state;
              const dialogs = { ...state.dialogs, [event.requestId]: toPendingDialog(event) };
              return { dialogs, dialogOrder: [...state.dialogOrder.filter((id) => id !== event.requestId), event.requestId] };
            }
            case 'dialogSettled': {
              if (!(event.requestId in state.dialogs)) return state;
              return {
                dialogs: omitKey(state.dialogs, event.requestId),
                dialogOrder: state.dialogOrder.filter((id) => id !== event.requestId),
              };
            }
            default: {
              const threadId = (event as { threadId?: string }).threadId;
              if (typeof threadId !== 'string' || threadId.length === 0) return state;
              return { threads: { ...state.threads, [threadId]: foldThreadEvent(threadOf(state, threadId), event, now) } };
            }
          }
        });
      },
      hydrate(threadId, action) {
        set((state) => ({ threads: { ...state.threads, [threadId]: foldHydrate(threadOf(state, threadId), action) } }));
      },
      stopIntent(threadId) {
        set((state) => ({ threads: { ...state.threads, [threadId]: foldStopIntent(threadOf(state, threadId)) } }));
      },
      bootstrap(data) {
        const sessions: Record<string, SessionView> = {};
        for (const session of data.sessions) sessions[session.threadId] = session;
        set((state) => {
          // 会话表全量替换；线程折叠状态按会话存在性合并（bootstrap 可能晚于在途事件到达）
          const threads: Record<string, LiveThreadState> = {};
          for (const threadId of Object.keys(sessions)) {
            threads[threadId] = state.threads[threadId] ?? initialThreadState;
          }
          const activeThreadId = state.activeThreadId !== null && state.activeThreadId in sessions ? state.activeThreadId : firstSessionId(sessions);
          return {
            bootstrapLoaded: true,
            bootstrapError: null,
            sessions,
            saved: data.saved,
            models: data.models,
            providers: data.providers,
            threads,
            activeThreadId,
          };
        });
      },
      bootstrapFailed(reason) {
        set({ bootstrapLoaded: true, bootstrapError: reason });
      },
      setActiveThread(threadId) {
        set({ activeThreadId: threadId });
      },
      updateStats(threadId, stats) {
        set((state) => ({ stats: { ...state.stats, [threadId]: stats } }));
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

export function threadModelOf(state: LiveStoreState, threadId: string): ThreadModel {
  const thread = state.threads[threadId] ?? initialThreadState;
  return { sessionId: threadId, items: thread.items, agents: thread.agents };
}

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

function omitKey<T>(source: Readonly<Record<string, T>>, key: string): Record<string, T> {
  const out: Record<string, T> = {};
  for (const [name, value] of Object.entries(source)) {
    if (name !== key) out[name] = value;
  }
  return out;
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
    threads: {},
    dialogs: {},
    dialogOrder: [],
    activeThreadId: null,
    stats: {},
    notices: [],
  };
}
