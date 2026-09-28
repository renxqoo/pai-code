/**
 * relay 装配根（T58 P2）：传输（relay transport）+ Client 适配 + 同步器组合。
 * 与 LAN 期 bridge-runtime 同职责，差异仅传输段——事件路由/水化/store 面全复用
 * （session-sync/history-sync/entriesToMessages 原样，见 MIGRATION 矩阵）。
 * 文件职责：装配 + 事件路由（拆出 useRelayStatus 到 hooks 面）。
 */
import * as React from 'react';

import type { ApiMethod, ApiOutcome, Client, UiEvent, Unsubscribe } from '@paiapp/contracts';

import { createBridgeClient, type BridgeClient } from '../transport/client';
import { createRelayTransport, type RelayStatus, type RelayTransport } from './transport';
import { createRelayRatchetCodec } from './ratchet-codec';
import { createKvRatchetStore, preloadRelayCredentials, relayCredentialsStore, type RelayCredentials } from './credentials';
import { createSessionSync } from '../state/session-sync';
import { createHistorySync } from '../state/history-sync';
import { useConversationStore } from '@/store/conversation-store';
import { useHistoryStore } from '@/store/history-store';
import { useComposerStore } from '@/store/composer-store';
import type { ChatMessage } from '@/types/domain';

export interface RelayRuntime {
  client: BridgeClient;
  transport: RelayTransport;
  status: RelayStatus;
  /** 设备凭证（配对后可用）。 */
  credentials: RelayCredentials | null;
  /** 配对完成后的正式连接（经凭证 + relay token）。 */
  connectWithCredentials(relayToken: string): void;
  disconnect(): void;
}

let runtime: RelayRuntime | null = null;

export function getRelayRuntime(): RelayRuntime | null {
  return runtime;
}

export function initializeRelayRuntime(): RelayRuntime {
  if (runtime !== null) return runtime;

  // 传输（codec 由凭证种子；无凭证时占位——connectWithCredentials 重建）
  const placeholderCodec = {
    seal: async () => {
      await Promise.resolve();
      return null;
    },
    open: async () => {
      await Promise.resolve();
      return null;
    },
  };
  const transport = createRelayTransport({
    relayUrl: '',
    relayToken: '',
    deviceId: '',
    installationId: '',
    codec: placeholderCodec,
    socketFactory: () => {
      throw new Error('not configured');
    },
    callbacks: {
      onStatus(status, detail) {
        if (runtime === null) return;
        (runtime as RelayRuntime & { status: RelayStatus }).status = status;
        notifyStatusListeners();
        void detail;
      },
      onFrame(frame) {
        // L2 帧 → Client 订阅面（session-sync/history-sync 挂载处）
        const event = frame.kind === 'event' ? (frame.body as Record<string, unknown>) : null;
        if (event !== null) clientRef?.dispatch({ ...event, type: event['name'] });
      },
      onRelayMessage() {
        // relay 控制行（no-route 等）——观测面（日志）
      },
    },
  });

  const client = createBridgeClient({ transport: transport as never });
  const clientRef: BridgeClient | null = client;

  historySyncRef = createHistorySync({
    onSessions(sessions) {
      useHistoryStore.getState().replaceSessions(sessions);
    },
  });

  sessionSyncRef = createSessionSync({
    onDialogRequest(request, settledId) {
      if (request === null) {
        if (settledId !== null && settledId !== undefined && settledId.length > 0) {
          useConversationStore.getState().settlePermission(settledId);
        } else {
          useConversationStore.getState().clearPermission();
        }
        return;
      }
      useConversationStore.getState().requestPermission({ id: request.requestId, title: request.title, command: request.command, approved: null });
    },
    onSessionEvent() {
      // 会话级事件已在订阅回调直调 routeEvent——此回灌通道废弃（双路由根治）
    },
  });

  // 事件路由（模块级常量——热路径零分配）
  client.subscribe((event) => {
    const record = event as unknown as Record<string, unknown>;
    const type = textOf(record['type']);
    const threadId = typeof record['threadId'] === 'string' ? (record['threadId'] as string) : null;
    if (type === 'dialogRequest' || type === 'dialogSettled') {
      sessionSyncRef?.handleEvent(record as Record<string, unknown>);
      return;
    }
    // 会话生命周期事件只走 routeEvent（session-sync 的 onSessionEvent 回灌会造成二跳双路由）
    if (type === 'sessionUpdated' || type === 'sessionRemoved' || type === 'sessionDied' || type === 'sessionParked') {
      routeEvent(event);
      return;
    }
    if (threadId !== null && threadId === activeThreadId && sessionSyncRef !== null) {
      sessionSyncRef.handleEvent(record as Record<string, unknown>);
      const snapshot = sessionSyncRef.snapshot();
      useConversationStore.getState().appendMessages(snapshot.messages);
      useComposerStore.getState().setGenerating(snapshot.streaming);
      if (type === 'turnSettled') void reconcileThread(threadId);
    }
  });

  runtime = {
    client,
    transport,
    status: 'disconnected',
    credentials: null,
    connectWithCredentials(relayToken) {
      const credentials = relayCredentialsStore.load();
      if (credentials === null) return;
      const codec = createRelayRatchetCodec({
        deviceId: credentials.deviceId,
        installationId: credentials.installationId,
        sharedSecretHex: credentials.sharedSecretHex,
        store: createKvRatchetStore(),
      });
      // 重建传输（真 codec + RN socket）
      const real = createRelayTransport({
        relayUrl: credentials.relayUrl,
        relayToken,
        deviceId: credentials.deviceId,
        installationId: credentials.installationId,
        codec,
        socketFactory: (url) => rnSocketFactoryWithToken(url, relayToken),
        callbacks: {
          onStatus(status, detail) {
            (runtime as RelayRuntime & { status: RelayStatus }).status = status;
            notifyStatusListeners();
            void detail;
          },
          onFrame(frame) {
            const event = frame.kind === 'event' ? (frame.body as Record<string, unknown>) : null;
            if (event !== null) clientRef?.dispatch({ ...event, type: event['name'] });
          },
          onRelayMessage() {
            // 观测面
          },
        },
      });
      (runtime as RelayRuntime & { transport: RelayTransport }).transport = real;
      (runtime as RelayRuntime & { credentials: RelayCredentials | null }).credentials = credentials;
      real.connect();
    },
    disconnect() {
      transport.stop();
      runtime?.transport.stop();
    },
  } as RelayRuntime;
  return runtime;
}

let activeThreadId: string | null = null;

export function attachThread(threadId: string | null): void {
  activeThreadId = threadId;
  void initializeRelayRuntime();
  sessionSyncRef?.reset();
  if (threadId === null) {
    useConversationStore.getState().startNewSession();
  }
}

let sessionSyncRef: ReturnType<typeof createSessionSync> | null = null;
/** 历史水化（session/entries；staleGuard：await 期间切会话弃用迟到载荷）。 */
export async function hydrateThread(threadId: string): Promise<void> {
  const rt = getRelayRuntime();
  if (rt === null) return;
  const outcome = (await rt.client.invoke('session/entries', { threadId })) as { ok: boolean; data?: { items?: unknown[] } };
  if (activeThreadId !== threadId) return;
  if (!outcome.ok) return;
  const items = Array.isArray(outcome.data?.items) ? (outcome.data?.items as unknown[]) : [];
  const sync = sessionSyncRef;
  if (sync === null) return;
  sync.seed(entriesToMessages(items));
  useConversationStore.getState().appendMessages(sync.snapshot().messages);
}

async function reconcileThread(threadId: string): Promise<void> {
  await hydrateThread(threadId);
}

/** 事件字段安全取串（object → ''）。 */
function textOf(value: unknown): string {
  if (typeof value === 'string') return value;
  return '';
}

function routeEvent(event: UiEvent): void {
  if (runtime === null) return;
  const record = event as unknown as Record<string, unknown>;
  const type = textOf(record['type']);
  if (type === 'sessionUpdated') {
    historySyncOf()?.updateSession(record['session'] as Record<string, unknown>);
    return;
  }
  if (type === 'sessionRemoved') {
    historySyncOf()?.removeSession(textOf(record['threadId']));
    return;
  }
  if (type === 'sessionDied' || type === 'sessionParked') {
    const threadId = textOf(record['threadId']);
    historySyncOf()?.updateSession({ threadId, state: 'dead' });
    if (threadId === activeThreadId) {
      sessionSyncRef?.handleEvent({ type: 'turnSettled', threadId, ok: false, reason: 'session ended' });
      const snapshot = sessionSyncRef?.snapshot();
      if (snapshot !== undefined) {
        useConversationStore.getState().appendMessages(snapshot.messages);
        useComposerStore.getState().setGenerating(false);
      }
    }
    return;
  }
}

let historySyncRef: ReturnType<typeof createHistorySync> | null = null;
function historySyncOf(): ReturnType<typeof createHistorySync> | null {
  return historySyncRef;
}

/** HistoryItem[]（contracts）→ ChatMessage[]（PC 语义对齐——块序/bash 三态/images/失败轮）。 */
export function entriesToMessages(items: unknown[]): ChatMessage[] {
  const messages: ChatMessage[] = [];
  for (const raw of items) {
    if (typeof raw !== 'object' || raw === null) continue;
    const item = raw as Record<string, unknown>;
    const kind = textOf(item['kind']);
    const atMs = Number(item['at'] ?? 0);
    const at = new Date(Number.isFinite(atMs) ? atMs : 0).toISOString();
    if (kind === 'user') {
      if (item['meta'] === 'compaction-summary') continue;
      const message: ChatMessage = { id: textOf(item['id']) || `u${messages.length}`, kind: 'user', text: textOf(item['text']), createdAt: at };
      const images = item['images'];
      if (Array.isArray(images) && images.length > 0) {
        message.attachments = (images as Array<Record<string, unknown>>).map((image, index) => ({
          id: `img-${textOf(item['id']) || index}`,
          name: 'image',
          size: 0,
          kind: 'image' as const,
          status: 'ready' as const,
          ...(typeof image['data'] === 'string' ? { uri: `data:${textOf(image['mediaType'])};base64,${image['data']}` } : {}),
        }));
      }
      messages.push(message);
      continue;
    }
    if (kind === 'assistant') {
      const calls = item['toolCalls'];
      const toolCalls = Array.isArray(calls) ? (calls as Array<Record<string, unknown>>) : [];
      const text = textOf(item['text']);
      const thinking = textOf(item['thinking']);
      if (thinking.length > 0) {
        messages.push({ id: `think-${textOf(item['id']) || messages.length}`, kind: 'thinking', text: thinking, createdAt: at, status: 'ok' });
      }
      if (text.length > 0) {
        messages.push({ id: textOf(item['id']) || `a${messages.length}`, kind: 'assistant', text, createdAt: at });
      }
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
      const stopReason = textOf(item['stopReason']);
      if (stopReason.length > 0 && stopReason !== 'end_turn') {
        const errorMessage = textOf(item['errorMessage']);
        messages.push({ id: `fail-${textOf(item['id']) || messages.length}`, kind: 'status', text: errorMessage.length > 0 ? errorMessage : `模型终止（${stopReason}）`, createdAt: at, status: 'failed', summary: '任务未完成' });
      }
      continue;
    }
    if (kind === 'bash') {
      const cancelled = item['cancelled'] === true;
      const exitCode = typeof item['exitCode'] === 'number' ? (item['exitCode'] as number) : null;
      const status: ChatMessage['status'] = cancelled ? 'stopped' : exitCode === null || exitCode === 0 ? 'ok' : 'failed';
      messages.push({ id: `bash-${textOf(item['id']) || messages.length}`, kind: 'tool', text: textOf(item['output']), createdAt: at, status, toolName: 'bash', argsPreview: textOf(item['command']), exitCode });
    }
  }
  return messages;
}

// ---- 状态订阅（React hook 面）----

const statusListeners = new Set<() => void>();

function notifyStatusListeners(): void {
  for (const listener of statusListeners) listener();
}

export function useRelayStatus(): { status: RelayStatus; runtime: RelayRuntime | null } {
  const [, force] = React.useReducer((n: number) => n + 1, 0);
  React.useEffect(() => {
    statusListeners.add(force);
    return () => {
      statusListeners.delete(force);
    };
  }, [force]);
  const current = getRelayRuntime();
  return { status: current === null ? 'disconnected' : current.status, runtime: current };
}

/** 启动数据装载（ready 后：bootstrap → 历史 + 偏好；并发互斥）。 */
let bootstrapInFlight: Promise<void> | null = null;

export function loadBootstrap(client: Client): Promise<void> {
  if (bootstrapInFlight !== null) return bootstrapInFlight;
  bootstrapInFlight = (async () => {
    try {
      const outcome = (await client.invoke('app/bootstrap', {})) as { ok: boolean; data?: Record<string, unknown> };
      if (!outcome.ok || outcome.data === undefined) return;
      const data = outcome.data;
      const sessions = Array.isArray(data['sessions']) ? (data['sessions'] as Array<Record<string, unknown>>) : [];
      const saved = Array.isArray(data['saved']) ? (data['saved'] as Array<Record<string, unknown>>) : [];
      const preferences = (data['preferences'] ?? {}) as Record<string, unknown>;
      currentPreferences = {
        pinnedSessions: Array.isArray(preferences['pinnedSessions']) ? (preferences['pinnedSessions'] as string[]) : [],
        archivedSessions: Array.isArray(preferences['archivedSessions']) ? (preferences['archivedSessions'] as string[]) : [],
      };
      noteThreadPaths(sessions);
      historySyncRef?.seedBootstrap(sessions, saved, currentPreferences);
    } finally {
      bootstrapInFlight = null;
    }
  })();
  return bootstrapInFlight;
}

/** 预载凭证后若有即自动连接（App 根部 BridgeGate 调用）。 */
export async function bootstrapRelayRuntime(): Promise<void> {
  await preloadRelayCredentials();
  const credentials = relayCredentialsStore.load();
  void initializeRelayRuntime();
  if (credentials === null) return;
  // relay token：配对产物（gateway enroll token 换发——一期由 pairing 写入凭证同存）
  runtime?.connectWithCredentials(credentials.sharedSecretHex);
}

/** RN socket 工厂（token query——relay 鉴权面）。 */
function rnSocketFactoryWithToken(url: string, token: string) {
  const ws = new WebSocket(`${url}?token=${encodeURIComponent(token)}`);
  return {
    send: (data: string) => ws.send(data),
    close: () => ws.close(),
    onOpen: (cb: () => void) => {
      ws.onopen = cb;
    },
    onMessage: (cb: (data: string) => void) => {
      ws.onmessage = (event: unknown) => cb(String((event as { data: unknown }).data));
    },
    onClose: (cb: () => void) => {
      ws.onclose = cb;
    },
    onError: (cb: () => void) => {
      ws.onerror = cb;
    },
  };
}

export type { Unsubscribe, ApiMethod, ApiOutcome };

// ---- LAN 兼容别名（UI 调用面零改动——MIGRATION D8：全部 UI 屏经抽象消费）----

export const initializeBridge = initializeRelayRuntime;
export const getBridge = getRelayRuntime;
export { useRelayStatus as useBridgeStatus };

/** 偏好切换（app/setPreference 与 PC 同源；sessionPath 键域）。 */
const threadPaths = new Map<string, string>();
let currentPreferences: { pinnedSessions?: string[]; archivedSessions?: string[] } = {};

export async function preferenceToggle(threadId: string, kind: 'pinned' | 'archived'): Promise<boolean> {
  const rt = getRelayRuntime();
  if (rt === null) return false;
  const path = threadPaths.get(threadId);
  if (path === undefined) return false;
  const key = kind === 'pinned' ? 'pinnedSessions' : 'archivedSessions';
  const current = new Set(currentPreferences[key] ?? []);
  if (current.has(path)) current.delete(path);
  else current.add(path);
  const next = [...current];
  const outcome = (await rt.client.invoke('app/setPreference', { [key]: next })) as { ok: boolean };
  if (outcome.ok) currentPreferences = { ...currentPreferences, [key]: next };
  return outcome.ok;
}

function noteThreadPaths(sessions: Array<Record<string, unknown>>): void {
  for (const raw of sessions) {
    const threadId = textOf(raw['threadId']);
    const sessionPath = raw['sessionPath'];
    if (threadId.length > 0 && typeof sessionPath === 'string') threadPaths.set(threadId, sessionPath);
  }
}
