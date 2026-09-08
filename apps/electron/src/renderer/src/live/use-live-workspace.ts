import * as React from 'react';

import type { SessionView } from '@paiapp/contracts';
import { useStore } from 'zustand';

import { collectThreadDiff } from '@/diff-panel/collect-thread-diff';
import type { SessionCardModel } from '@/sidebar/session-card-model';
import type { ThreadModel } from '@/thread/thread-model';
import { summarizeAgents } from '@/thread/panel-summary';
import { copy } from '@/strings';

import { createBridgeClient } from './client-invoke';
import { createLiveController, type LiveController } from './live-controller';
import { createLiveStore, threadModelOf, type LiveStoreState, type PendingDialog } from './store';

/**
 * live 工作区装配：store/controller 单例 + React 订阅面。
 * 生产装配唯一入口（demo 装配只服务组件测试夹具）。
 */

const store = createLiveStore();
const bridgeClient = createBridgeClient(window.pai);
const controller: LiveController = createLiveController(bridgeClient, store);
// 诊断句柄（e2e/排障用）：只读快照 + 事件观察
declare global {
  interface Window {
    __paiDebug?: { snapshot(): unknown };
  }
}
if (typeof window !== 'undefined') {
  window.__paiDebug = { snapshot: () => ({ ...store.getState(), controllerPhase: 'n/a' }) };
}

export type ComposerSelection = {
  model: string;
  modelOptions: readonly string[];
  effort: string;
  effortOptions: readonly string[];
  access: string;
  accessOptions: readonly string[];
  checkout: string;
  checkoutOptions: readonly string[];
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
  agentsActive: boolean;
  queueCount: number;
  crashed: boolean;
  compacting: boolean;
  retrying: { attempt: number; maxAttempts: number } | null;
  hydrateFailed: boolean;
  now: number;
  hasActivity: boolean;
  threadDiff: ReturnType<typeof collectThreadDiff>;
  composer: ComposerSelection;
  dialogs: readonly PendingDialog[];
  notices: readonly { id: string; text: string }[];
  saved: ReadonlyArray<{ sessionPath: string; title: string; cwd: string; modifiedAt: number; messageCount: number }>;
  providers: LiveStoreState['providers'];
  thinkingLevels: readonly string[];
  actions: {
    readonly submitDraft: (message: string) => Promise<string | null>;
    readonly stopActiveTurn: () => void;
    readonly selectSession: (threadId: string) => void;
    readonly createSession: (cwd: string) => Promise<boolean>;
    readonly openSavedSession: (sessionPath: string) => Promise<boolean>;
    readonly closeSession: (threadId: string) => void;
    readonly selectModel: (value: string) => void;
    readonly selectEffort: (value: string) => void;
    readonly respondDialog: (requestId: string, payload: Record<string, unknown>) => void;
    readonly cancelDialog: (requestId: string) => void;
    readonly dismissNotice: (id: string) => void;
    readonly refreshSaved: () => void;
    readonly upsertProvider: (input: { name: string; baseUrl: string; api: string; models: string[]; apiKey?: string }) => Promise<boolean>;
    readonly removeProvider: (name: string) => Promise<boolean>;
    readonly compact: () => void;
  };
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

export function useLiveWorkspace(): LiveWorkspaceView {
  const state = useStore(store);
  const [now, setNow] = React.useState(() => Date.now());
  const [effortLevels, setEffortLevels] = React.useState<readonly string[]>([]);

  React.useEffect(() => {
    void controller.start();
    return () => controller.dispose();
  }, []);

  const activeThreadId = state.activeThreadId ?? '';
  const activeThread = React.useMemo(() => threadModelOf(state, activeThreadId), [state, activeThreadId]);
  const threadState = state.threads[activeThreadId];

  React.useEffect(() => {
    if (activeThreadId.length === 0) return;
    void controller.ensureHydrated(activeThreadId);
    // 思考档位随会话拉取（模型能力差异）
    void bridgeClient.invoke('session/thinkingLevels', { threadId: activeThreadId }).then((outcome) => {
      if (outcome.ok) setEffortLevels(outcome.data.allowed);
    });
    void controller.refreshStats(activeThreadId);
  }, [activeThreadId]);

  const generating = threadState?.streaming ?? false;
  const hasActivity = React.useMemo(
    () =>
      Object.values(state.threads).some(
        (thread) => thread.streaming || thread.compacting || thread.agents.some((agent) => agent.status === 'working'),
      ),
    [state.threads],
  );

  React.useEffect(() => {
    if (!hasActivity) return;
    const handle = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(handle);
  }, [hasActivity]);

  const activeSession = state.sessions[activeThreadId];
  const stateModels = state.models;
  const stateStats = state.stats;
  const composer = React.useMemo(
    () => buildComposer({ ...state, models: stateModels, stats: stateStats }, activeSession, threadState, effortLevels),
    [stateModels, stateStats, activeSession, threadState, effortLevels],
  );

  return {
    ready: state.bootstrapLoaded,
    bootstrapError: state.bootstrapError,
    bridgeAvailable: bridgeClient.available,
    hostPhase: state.hostPhase,
    sessions: React.useMemo(() => toCards(state.sessions), [state.sessions]),
    activeThreadId,
    activeThread,
    activeCwd: activeSession?.cwd ?? '',
    generating,
    agentsActive: summarizeAgents(activeThread.agents).workingCount > 0,
    queueCount: (threadState?.queue.steering.length ?? 0) + (threadState?.queue.followUp.length ?? 0),
    crashed: threadState?.crashed ?? false,
    compacting: threadState?.compacting ?? false,
    retrying: threadState?.retrying ?? null,
    hydrateFailed: threadState?.hydrateFailed ?? false,
    now,
    hasActivity,
    threadDiff: React.useMemo(() => collectThreadDiff(activeThread), [activeThread]),
    composer,
    dialogs: state.dialogOrder.map((id) => state.dialogs[id]).filter((dialog): dialog is PendingDialog => dialog !== undefined),
    notices: state.notices,
    saved: state.saved.map((session) => ({
      sessionPath: session.sessionPath,
      title: session.name ?? session.firstMessage.slice(0, 40),
      cwd: session.cwd,
      modifiedAt: session.modifiedAt,
      messageCount: session.messageCount,
    })),
    providers: state.providers,
    thinkingLevels: effortLevels,
    actions: {
      submitDraft: async (message) => {
        const reason = await controller.submitDraft(activeThreadId, message);
        if (reason !== null && reason !== 'bridge_unavailable') {
          store.setState({ notices: [...store.getState().notices.slice(-4), { id: `send-fail-${Date.now()}`, text: copy.flow.sendFailed(reason) }] });
        }
        return reason;
      },
      stopActiveTurn: () => void controller.stopActiveTurn(activeThreadId),
      selectSession: (threadId) => {
        store.getState().setActiveThread(threadId);
      },
      createSession: (cwd) => {
        const selected = state.models.find((entry) => `${entry.provider}/${entry.modelId}` === composer.model) ?? state.models[0];
        return controller.createSession(cwd, selected);
      },
      openSavedSession: (sessionPath) => controller.openSavedSession(sessionPath),
      closeSession: (threadId) => void controller.closeSession(threadId),
      selectModel: (value) => {
        const model = state.models.find((entry) => `${entry.provider}/${entry.modelId}` === value);
        if (model !== undefined) void controller.selectModel(activeThreadId, model.provider, model.modelId);
      },
      selectEffort: (value) => {
        const level = Object.entries(EFFORT_LABELS).find(([, label]) => label === value)?.[0];
        if (level !== undefined) void controller.selectThinking(activeThreadId, level);
      },
      respondDialog: (requestId, payload) => void controller.respondDialog(requestId, payload),
      cancelDialog: (requestId) => void controller.cancelDialog(requestId),
      dismissNotice: (id) => store.getState().dismissNotice(id),
      refreshSaved: () => void controller.refreshSaved(),
      upsertProvider: (input) => controller.upsertProvider(input),
      removeProvider: (name) => controller.removeProvider(name),
      compact: () => void controller.compact(activeThreadId),
    },
  };
}

function buildComposer(
  state: LiveStoreState,
  session: SessionView | undefined,
  thread: LiveStoreState['threads'][string] | undefined,
  effortLevels: readonly string[],
): ComposerSelection {
  const modelOptions = state.models.map((model) => `${model.provider}/${model.modelId}`);
  const currentModel = session?.model ?? modelOptions[0] ?? '';
  const levels = effortLevels.length > 0 ? effortLevels : ['off', 'low', 'medium', 'high'];
  const levelLabels = levels.map((level) => EFFORT_LABELS[level] ?? level);
  const currentLabel = session?.thinkingLevel !== undefined && session.thinkingLevel !== null ? EFFORT_LABELS[session.thinkingLevel] : undefined;
  // 未知档位回落到第一个可选档（模型能力列表是真相，不臆造默认）
  const effort = currentLabel ?? levelLabels[0] ?? '';
  const cwdBase = basename(session?.cwd ?? '');
  return {
    model: currentModel,
    modelOptions,
    effort,
    effortOptions: levelLabels,
    access: 'Standard',
    accessOptions: ['Standard'],
    checkout: cwdBase,
    checkoutOptions: cwdBase.length > 0 ? [cwdBase] : [],
    contextUsed: state.stats[session?.threadId ?? '']?.contextUsage ?? 0,
  };
}

function toCards(sessions: Readonly<Record<string, SessionView>>): readonly SessionCardModel[] {
  return Object.values(sessions)
    .sort((a, b) => b.lastActivityAt - a.lastActivityAt)
    .map((session) => ({
      id: session.threadId,
      conversationId: session.threadId,
      projectName: basename(session.cwd) || session.cwd,
      title: session.title,
      version: session.model ?? '',
      lastActivityAt: session.lastActivityAt,
    }));
}

function basename(path: string): string {
  const parts = path.split('/').filter((part) => part.length > 0);
  return parts[parts.length - 1] ?? '';
}
