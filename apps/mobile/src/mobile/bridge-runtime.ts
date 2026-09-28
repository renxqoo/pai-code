/**
 * bridge 装配（T57 §5）：传输 + Client + 同步器的组合根；UI store 的唯一数据源。
 * App 根部初始化一次（demo 模式下不初始化——离线演示）。
 */

import type { Client, UiEvent } from '@paiapp/contracts';
import type { ChatMessage } from '@/types/domain';

import { createBridgeClient, type BridgeClient } from './transport/client';
import { createWsTransport, DEVICE_NAME, rnSocketFactory, type BridgeServerInfo, type BridgeStatus } from './transport/ws-client';
import { createSessionSync } from './state/session-sync';
import { createHistorySync } from './state/history-sync';
import { useConversationStore } from '@/store/conversation-store';
import { useHistoryStore } from '@/store/history-store';
import { useComposerStore } from '@/store/composer-store';

export interface BridgeRuntime {
  client: BridgeClient;
  status: BridgeStatus;
  serverInfo: BridgeServerInfo | null;
  /** 配对（devices 页输入码后调用；成功令牌经 onPaired 落存储）。 */
  pair(code: string): Promise<{ ok: true; token: string } | { ok: false; reason: string }>;
  connect(url: string, token: string | null): void;
  disconnect(): void;
}

export interface BridgeConfig {
  host: string;
  port: number;
  token: string | null;
}

let runtime: BridgeRuntime | null = null;

export function getBridge(): BridgeRuntime | null {
  return runtime;
}

/** 事件路由：会话事件按 threadId 过滤（活跃会话进 session-sync；其余外置）。 */
function routeEvent(event: UiEvent): void {
  if (runtime === null) return;
  // 会话流事件类型集（threadId 域）
  const sessionScoped = new Set([
    'turnStarted',
    'userMessage',
    'messageStarted',
    'textDelta',
    'thinkingDelta',
    'streamRestarted',
    'toolCallAdded',
    'toolUpdated',
    'toolEnded',
    'messageFinal',
    'turnSettled',
    'queueChanged',
    'compacting',
    'compacted',
    'retrying',
    'subagentStarted',
    'subagentDelta',
    'subagentTool',
    'subagentSettled',
    'subagentState',
    'todoSnapshot',
    'bashOutput',
  ]);
  const record = event as unknown as Record<string, unknown>;
  const type = textOf(record['type']);
  if (sessionScoped.has(type)) return; // 由活跃会话装配驱动（见 attachThread）
  if (type === 'sessionUpdated') {
    historySync?.updateSession(record['session'] as Record<string, unknown>);
    return;
  }
  if (type === 'sessionRemoved') {
    historySync?.removeSession(textOf(record['threadId']));
    return;
  }
  if (type === 'sessionDied' || type === 'sessionParked') {
    const threadId = textOf(record['threadId']);
    historySync?.updateSession({ threadId, state: 'parked' });
    return;
  }
  // host 相位等其余事件：状态面更新（serverInfo.hostPhase）
  if (type === 'host') {
    // 相位事件在 bridge ready/serverInfo 已反映；此处不重复处理
  }
}

let historySync: ReturnType<typeof createHistorySync> | null = null;
let sessionSync: ReturnType<typeof createSessionSync> | null = null;
let activeThreadId: string | null = null;

export function initializeBridge(): BridgeRuntime {
  if (runtime !== null) return runtime;

  const transport = createWsTransport(rnSocketFactory, {
    onStatus(status, info) {
      if (runtime === null) return;
      (runtime as BridgeRuntime & { status: BridgeStatus }).status = status;
      if (info !== undefined) (runtime as BridgeRuntime & { serverInfo: BridgeServerInfo | null }).serverInfo = info;
      notifyStatusListeners();
    },
    onEvent(event) {
      // 事件路归一：transport 帧 → client 订阅面（session-sync/history-sync 经
      // 订阅挂载——测试经 dispatch 同路驱动）
      clientRef?.dispatch(event);
    },
    onAuthFailed(reason) {
      void reason;
      // 令牌失效：清存储（下次配对）
      notifyStatusListeners();
    },
  });

  const client = createBridgeClient({ transport });
  const clientRef: { dispatch(rawEvent: unknown): void } | null = client;
  client.subscribe((event) => {
    const record = event as unknown as Record<string, unknown>;
    const threadId = typeof record['threadId'] === 'string' ? (record['threadId'] as string) : null;
    const dialogKind = record['type'] === 'dialogRequest' || record['type'] === 'dialogSettled';
    if (sessionSync !== null && dialogKind) {
      // 弹窗族无 threadId 限制（跨会话清卡——恰一 settle 语义）
      sessionSync.handleEvent(record);
      const snapshotDialog = sessionSync.snapshot();
      useConversationStore.getState().appendMessages(snapshotDialog.messages);
    } else if (sessionSync !== null && threadId !== null && (threadId === activeThreadId || activeThreadId === null)) {
      sessionSync.handleEvent(record);
      const snapshot = sessionSync.snapshot();
      useConversationStore.getState().appendMessages(snapshot.messages);
      useComposerStore.getState().setGenerating(snapshot.streaming);
    }
    routeEvent(event);
  });

  historySync = createHistorySync({
    onSessions(sessions) {
      useHistoryStore.getState().replaceSessions(sessions);
    },
  });

  sessionSync = createSessionSync({
    onDialogRequest(request) {
      if (request === null) {
        useConversationStore.getState().clearPermission();
        return;
      }
      useConversationStore.getState().requestPermission({ id: request.requestId, title: request.title, command: request.command, approved: null });
    },
    onSessionEvent(event) {
      routeEvent(event as unknown as UiEvent);
    },
  });

  runtime = {
    client,
    status: 'disconnected',
    serverInfo: null,
    pair(code) {
      return transport.pair(code, DEVICE_NAME).then((result) => (result.ok ? { ok: true, token: result.token } : { ok: false, reason: result.reason }));
    },
    connect(url, token) {
      transport.connect(url, token);
    },
    disconnect() {
      transport.disconnect();
    },
  } as BridgeRuntime;
  return runtime;
}

/** 活跃会话绑定（打开会话/新建会话时调用；事件路由的 threadId 过滤器）。 */
export function attachThread(threadId: string | null): void {
  activeThreadId = threadId;
  sessionSync?.reset();
  if (threadId === null) {
    useConversationStore.getState().startNewSession();
  }
}

/** 历史水化（session/entries → ChatMessage[]；打开会话时调用）。 */
export async function hydrateThread(threadId: string): Promise<void> {
  if (runtime === null || sessionSync === null) return;
  const outcome = (await runtime.client.invoke('session/entries', { threadId })) as { ok: boolean; data?: { items?: unknown[] } };
  if (!outcome.ok) return;
  const items = Array.isArray(outcome.data?.items) ? (outcome.data?.items as unknown[]) : [];
  sessionSync.seed(entriesToMessages(items));
  useConversationStore.getState().appendMessages(sessionSync.snapshot().messages);
}

/** HistoryItem[]（contracts）→ ChatMessage[]（移动端模型）。 */
/** 事件字段安全取串：非 string/number/boolean → ''（object 不落 [object Object]） */
function textOf(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return '';
}

export function entriesToMessages(items: unknown[]): ChatMessage[] {
  const messages: ChatMessage[] = [];
  for (const raw of items) {
    if (typeof raw !== 'object' || raw === null) continue;
    const item = raw as Record<string, unknown>;
    const kind = textOf(item['kind']);
    const atMs = Number(item['at'] ?? 0);
    const at = new Date(Number.isFinite(atMs) ? atMs : 0).toISOString();
    if (kind === 'user') {
      messages.push({ id: textOf(item['id']) || `u${messages.length}`, kind: 'user', text: textOf(item['text']), createdAt: at });
      continue;
    }
    if (kind === 'assistant') {
      const calls = item['toolCalls'];
      const toolCalls = Array.isArray(calls) ? (calls as Array<Record<string, unknown>>) : [];
      for (const call of toolCalls) {
        const tool: ChatMessage = {
          id: textOf(call['id']) || `t${messages.length}`,
          kind: 'tool',
          text: textOf(call['output']),
          createdAt: at,
          status: call['isError'] === true ? 'failed' : 'ok',
          toolName: textOf(call['name']) || 'tool',
          argsPreview: textOf(call['argsPreview']),
        };
        const hunks = call['editHunks'];
        if (Array.isArray(hunks)) tool.editHunks = hunks as NonNullable<ChatMessage['editHunks']>;
        const spawns = call['subagents'];
        if (Array.isArray(spawns)) tool.subagents = spawns as NonNullable<ChatMessage['subagents']>;
        messages.push(tool);
      }
      const text = textOf(item['text']);
      const thinking = textOf(item['thinking']);
      if (thinking.length > 0) {
        messages.push({ id: `think-${textOf(item['id']) || messages.length}`, kind: 'thinking', text: thinking, createdAt: at, status: 'ok' });
      }
      if (text.length > 0) {
        messages.push({ id: textOf(item['id']) || `a${messages.length}`, kind: 'assistant', text, createdAt: at });
      }
      continue;
    }
    if (kind === 'bash') {
      messages.push({ id: `bash-${textOf(item['id']) || messages.length}`, kind: 'tool', text: textOf(item['output']), createdAt: at, status: item['cancelled'] === true ? 'stopped' : 'ok', toolName: 'bash', argsPreview: textOf(item['command']) });
    }
  }
  return messages;
}

// ---- 状态订阅（React hook 面）----

import * as React from 'react';

const statusListeners = new Set<() => void>();

function notifyStatusListeners(): void {
  for (const listener of statusListeners) listener();
}

export function useBridgeStatus(): { status: BridgeStatus; serverInfo: BridgeServerInfo | null; runtime: BridgeRuntime | null } {
  const [, force] = React.useReducer((n: number) => n + 1, 0);
  React.useEffect(() => {
    statusListeners.add(force);
    return () => {
      statusListeners.delete(force);
    };
  }, [force]);
  const current = getBridge();
  return {
    status: current === null ? 'disconnected' : current.status,
    serverInfo: current === null ? null : current.serverInfo,
    runtime: current,
  };
}

/** 启动数据装载（连接 ready 后调用一次：bootstrap → 历史 + 模型 + 偏好）。 */
export async function loadBootstrap(client: Client): Promise<void> {
  const outcome = (await client.invoke('app/bootstrap', {})) as { ok: boolean; data?: Record<string, unknown> };
  if (!outcome.ok || outcome.data === undefined) return;
  const data = outcome.data;
  const sessions = Array.isArray(data['sessions']) ? (data['sessions'] as Array<Record<string, unknown>>) : [];
  const preferences = (data['preferences'] ?? {}) as Record<string, unknown>;
  historySync?.seedBootstrap(sessions, {
    pinnedSessions: Array.isArray(preferences['pinnedSessions']) ? (preferences['pinnedSessions'] as string[]) : [],
    archivedSessions: Array.isArray(preferences['archivedSessions']) ? (preferences['archivedSessions'] as string[]) : [],
  });
}
