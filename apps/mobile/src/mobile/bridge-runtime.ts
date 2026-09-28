/**
 * bridge 装配（T57 §5）：传输 + Client + 同步器的组合根；UI store 的唯一数据源。
 * App 根部初始化一次（demo 模式下不初始化——离线演示）。
 */

import type { Client, UiEvent } from '@paiapp/contracts';
import type { ChatMessage } from '@/types/domain';

import { createBridgeClient, type BridgeClient } from './transport/client';
import { createWsTransport, DEVICE_NAME, rnSocketFactory, type BridgeServerInfo, type BridgeStatus } from './transport/ws-client';
import { bridgeStorage } from './transport/bridge-storage';
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
    // 部分视图：只改 state——title/cwd/时间保留既有（history-sync 逐字段合并）
    historySync?.updateSession({ threadId, state: 'parked' });
    // 活跃会话运行面收敛（M6）：worker 死/收编后流式窗口终结
    if (sessionSync !== null && threadId === activeThreadId) {
      sessionSync.handleEvent({ type: 'turnSettled', threadId, ok: false, reason: 'session ended' });
      const snapshot = sessionSync.snapshot();
      useConversationStore.getState().appendMessages(snapshot.messages);
      useComposerStore.getState().setGenerating(false);
    }
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
      // 令牌失效（撤销/换桌面）：清本地凭证——下次走重新配对
      bridgeStorage.clear();
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
    } else if (sessionSync !== null && threadId !== null && threadId === activeThreadId) {
      // 会话流事件仅并入活跃线程（null 通配会使任一后台会话灌入「新对话」屏）
      sessionSync.handleEvent(record);
      const snapshot = sessionSync.snapshot();
      useConversationStore.getState().appendMessages(snapshot.messages);
      useComposerStore.getState().setGenerating(snapshot.streaming);
      // 轮末对账：settle 后以 entries 重建（权威终局；吸收本地回显与流式态）
      if (record['type'] === 'turnSettled') void reconcileThread(threadId);
    }
    routeEvent(event);
  });

  historySync = createHistorySync({
    onSessions(sessions) {
      useHistoryStore.getState().replaceSessions(sessions);
    },
  });

  sessionSync = createSessionSync({
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

/** 历史水化（session/entries → ChatMessage[]；打开会话时调用）。
 *  staleGuard：await 期间用户切换会话则弃用迟到载荷。 */
export async function hydrateThread(threadId: string): Promise<void> {
  if (runtime === null || sessionSync === null) return;
  const outcome = (await runtime.client.invoke('session/entries', { threadId })) as { ok: boolean; data?: { items?: unknown[] } };
  if (activeThreadId !== threadId) return; // 代际守卫
  if (!outcome.ok) return;
  const items = Array.isArray(outcome.data?.items) ? (outcome.data?.items as unknown[]) : [];
  sessionSync.seed(entriesToMessages(items));
  useConversationStore.getState().appendMessages(sessionSync.snapshot().messages);
}

/** 轮末对账（PC 语义：settle 后 entries 重建——事件流只是装饰，WAL 是真相）。
 *  修复「本地回显被事件泵 snapshot 抹掉」的合流断裂。 */
async function reconcileThread(threadId: string): Promise<void> {
  if (runtime === null || sessionSync === null) return;
  const outcome = (await runtime.client.invoke('session/entries', { threadId })) as { ok: boolean; data?: { items?: unknown[]; cursor?: number | null } };
  if (activeThreadId !== threadId) return;
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
      if (item['meta'] === 'compaction-summary') continue; // 压缩摘要不进列表（PC 同语义）
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
      // 块序与实时流同构（thinking → text → toolCalls）：打开历史不重排
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
      // 失败轮零痕迹修复（M4）：异常终止的 assistant 追加失败 status 行
      const stopReason = textOf(item['stopReason']);
      if (stopReason.length > 0 && stopReason !== 'end_turn') {
        const errorMessage = textOf(item['errorMessage']);
        messages.push({ id: `fail-${textOf(item['id']) || messages.length}`, kind: 'status', text: errorMessage.length > 0 ? errorMessage : `模型终止（${stopReason}）`, createdAt: at, status: 'failed', summary: '任务未完成' });
      }
      continue;
    }
    if (kind === 'bash') {
      // 三态映射（M3）：cancelled=stopped；非零退出=failed（透出 exitCode）
      const cancelled = item['cancelled'] === true;
      const exitCode = typeof item['exitCode'] === 'number' ? (item['exitCode'] as number) : null;
      const status: ChatMessage['status'] = cancelled ? 'stopped' : exitCode === null || exitCode === 0 ? 'ok' : 'failed';
      messages.push({ id: `bash-${textOf(item['id']) || messages.length}`, kind: 'tool', text: textOf(item['output']), createdAt: at, status, toolName: 'bash', argsPreview: textOf(item['command']), exitCode });
    }
  }
  return messages;
}

/** 偏好键域换算表：threadId → sessionPath（bootstrap 装载时填充；键域真相在 PC 端）。 */
const threadPaths = new Map<string, string>();
let currentPreferences: { pinnedSessions?: string[]; archivedSessions?: string[] } = {};

/** 记录 bootstrap 偏好与键域映射（loadBootstrap 内部调用）。 */
function noteThreadPaths(sessions: Array<Record<string, unknown>>): void {
  for (const raw of sessions) {
    const threadId = textOf(raw['threadId']);
    const sessionPath = raw['sessionPath'];
    if (threadId.length > 0 && typeof sessionPath === 'string') threadPaths.set(threadId, sessionPath);
  }
}

/** 置顶/归档切换（与 PC 同一动词 app/setPreference——偏好是跨端真相）。
 *  键 = sessionPath；无 path 的会话（未落盘）本地降级。 */
export async function preferenceToggle(threadId: string, kind: 'pinned' | 'archived'): Promise<boolean> {
  if (runtime === null) return false;
  const path = threadPaths.get(threadId);
  if (path === undefined) return false;
  const key = kind === 'pinned' ? 'pinnedSessions' : 'archivedSessions';
  const current = new Set(currentPreferences[key] ?? []);
  if (current.has(path)) current.delete(path);
  else current.add(path);
  const next = [...current];
  const outcome = (await runtime.client.invoke('app/setPreference', { [key]: next })) as { ok: boolean };
  if (outcome.ok) currentPreferences = { ...currentPreferences, [key]: next };
  return outcome.ok;
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

/** 启动数据装载（连接 ready 后调用：bootstrap → 历史 + 模型 + 偏好 + saved）。
 *  并发互斥（多组件同时触发复用同一 Promise）；失败不缓存（下次 ready 重试）。 */
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
      historySync?.seedBootstrap(sessions, saved, currentPreferences);
    } finally {
      bootstrapInFlight = null;
    }
  })();
  return bootstrapInFlight;
}
