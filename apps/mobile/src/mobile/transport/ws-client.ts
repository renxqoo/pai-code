/**
 * WS 传输（T57 §5）：连桌面端 mobile bridge。
 * 重连退避 1s→30s；invoke pending 表（id 关联响应）；事件 seq 确认；
 * 令牌鉴权（配对产物）；连接状态回调。
 */
import { Platform } from 'react-native';

export type BridgeStatus = 'disconnected' | 'connecting' | 'authenticating' | 'ready';

export interface BridgeServerInfo {
  appVersion: string;
  hostPhase: 'starting' | 'ready' | 'restarting' | 'failed' | null;
}

interface PendingInvoke {
  resolve: (value: { ok: boolean; data?: unknown; error?: { kind: string } & Record<string, unknown> }) => void;
  timer: ReturnType<typeof setTimeout>;
}

export interface WsTransportCallbacks {
  onStatus(status: BridgeStatus, info?: BridgeServerInfo): void;
  onEvent(event: unknown): void;
  /** 配对码被拒/令牌失效（需重新配对）。 */
  onAuthFailed(reason: string): void;
}

export interface WsTransport {
  connect(url: string, token: string | null): void;
  invoke(method: string, params: unknown, timeoutMs?: number): Promise<{ ok: boolean; data?: unknown; error?: { kind: string } & Record<string, unknown> }>;
  pair(code: string, deviceName: string): Promise<{ ok: true; token: string; serverInfo: BridgeServerInfo } | { ok: false; reason: string }>;
  disconnect(): void;
  status(): BridgeStatus;
}

/** WS 实现注入（生产 react-native WebSocket；测试内存对）。 */
export type SocketFactory = (url: string) => RnSocketLike;

export interface RnSocketLike {
  send(data: string): void;
  close(): void;
  onOpen(cb: () => void): void;
  onMessage(cb: (data: string) => void): void;
  onClose(cb: () => void): void;
  onError(cb: () => void): void;
}

/** 帧字段安全取串（object → ''——不下 [object Object]） */
function textOf(value: unknown): string {
  if (typeof value === 'string') return value;
  return '';
}

const DEFAULT_TIMEOUT_MS = 30_000;

export function createWsTransport(socketFactory: SocketFactory, callbacks: WsTransportCallbacks): WsTransport {
  let socket: RnSocketLike | null = null;
  let status: BridgeStatus = 'disconnected';
  let url = '';
  let token: string | null = null;
  let stopped = true;
  let backoff = 1000;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let invokeId = 0;
  const pending = new Map<string, PendingInvoke>();
  let lastEventSeq = 0;
  let pairWaiter: ((result: { ok: true; token: string; serverInfo: BridgeServerInfo } | { ok: false; reason: string }) => void) | null = null;

  const setStatus = (next: BridgeStatus, info?: BridgeServerInfo): void => {
    status = next;
    callbacks.onStatus(next, info);
  };

  const scheduleReconnect = (): void => {
    if (stopped) return;
    if (reconnectTimer !== null) return;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      if (!stopped) dial();
    }, backoff);
    backoff = Math.min(backoff * 2, 30_000);
  };

  const handleFrame = (raw: string): void => {
    let frame: Record<string, unknown>;
    try {
      frame = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return;
    }
    const type = frame['type'];
    if (type === 'pong') return;
    if (type === 'paired') {
      pairWaiter?.({ ok: true, token: textOf(frame['token']), serverInfo: frame['serverInfo'] as BridgeServerInfo });
      pairWaiter = null;
      return;
    }
    if (type === 'pairFailed') {
      pairWaiter?.({ ok: false, reason: textOf(frame['reason']) || 'unknown' });
      pairWaiter = null;
      return;
    }
    if (type === 'authFailed') {
      const reason = textOf(frame['reason']) || 'unknown';
      pairWaiter?.({ ok: false, reason });
      pairWaiter = null;
      callbacks.onAuthFailed(reason);
      stopped = true;
      socket?.close();
      setStatus('disconnected');
      return;
    }
    if (type === 'ready') {
      backoff = 1000;
      setStatus('ready', frame['serverInfo'] as BridgeServerInfo | undefined);
      return;
    }
    if (type === 'invokeResult') {
      const id = textOf(frame['id']);
      const entry = pending.get(id);
      if (entry === undefined) return;
      pending.delete(id);
      clearTimeout(entry.timer);
      if (frame['ok'] === true) entry.resolve({ ok: true, data: frame['data'] });
      else entry.resolve({ ok: false, error: frame['error'] as { kind: string } & Record<string, unknown> });
      return;
    }
    if (type === 'event') {
      const seq = Number(frame['seq'] ?? 0);
      if (seq > lastEventSeq) {
        lastEventSeq = seq;
        callbacks.onEvent(frame['event']);
        // 批量确认：每帧即时 ack（帧量低时开销可忽略；高频流可优化为合并）
        socket?.send(JSON.stringify({ type: 'ack', seq }));
      }
    }
  };

  const dial = (): void => {
    if (url.length === 0) return;
    setStatus('connecting');
    const ws = socketFactory(url);
    socket = ws;
    ws.onOpen(() => {
      if (token !== null) {
        setStatus('authenticating');
        ws.send(JSON.stringify({ type: 'auth', token }));
      }
      // 无令牌：连接仅用于配对（pair() 单独驱动）
    });
    ws.onMessage((data) => handleFrame(data));
    ws.onClose(() => {
      socket = null;
      failAllPending();
      setStatus('disconnected');
      scheduleReconnect();
    });
    ws.onError(() => {
      ws.close();
    });
  };

  const failAllPending = (): void => {
    for (const entry of pending.values()) {
      clearTimeout(entry.timer);
      entry.resolve({ ok: false, error: { kind: 'transient', face: 'host_unavailable' } });
    }
    pending.clear();
  };

  return {
    connect(nextUrl: string, nextToken: string | null) {
      url = nextUrl;
      token = nextToken;
      stopped = false;
      backoff = 1000;
      dial();
    },
    invoke(method, params, timeoutMs = DEFAULT_TIMEOUT_MS) {
      invokeId += 1;
      const id = `m${invokeId}`;
      return new Promise((resolve) => {
        if (socket === null || status !== 'ready') {
          resolve({ ok: false, error: { kind: 'transient', face: 'host_unavailable' } });
          return;
        }
        const timer = setTimeout(() => {
          pending.delete(id);
          resolve({ ok: false, error: { kind: 'transient', face: 'timeout' } });
        }, timeoutMs);
        pending.set(id, { resolve, timer });
        socket.send(JSON.stringify({ type: 'invoke', id, method, params: params ?? {} }));
      });
    },
    pair(code, deviceName) {
      return new Promise((resolve) => {
        if (socket === null) {
          resolve({ ok: false, reason: 'not_connected' });
          return;
        }
        pairWaiter = resolve;
        socket.send(JSON.stringify({ type: 'pair', code, deviceName }));
        setTimeout(() => {
          if (pairWaiter === resolve) {
            pairWaiter = null;
            resolve({ ok: false, reason: 'timeout' });
          }
        }, 10_000);
      });
    },
    disconnect() {
      stopped = true;
      if (reconnectTimer !== null) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      failAllPending();
      socket?.close();
      socket = null;
      setStatus('disconnected');
    },
    status: () => status,
  };
}

/** RN WebSocket 适配（on* 事件订阅模型）。 */
export function rnSocketFactory(url: string): RnSocketLike {
  const ws = new WebSocket(url);
  return {
    send: (data) => ws.send(data),
    close: () => ws.close(),
    onOpen: (cb) => {
      ws.onopen = cb;
    },
    onMessage: (cb) => {
      ws.onmessage = (event) => cb(String(event.data));
    },
    onClose: (cb) => {
      ws.onclose = cb;
    },
    onError: (cb) => {
      ws.onerror = cb;
    },
  };
}

/** 缺省 bridge URL 构造（ws://host:8787）。 */
export function bridgeUrl(host: string, port = 8787): string {
  return `ws://${host}:${port}`;
}

export const DEVICE_NAME = `${Platform.OS === 'ios' ? 'iPhone' : 'Android'} · Pai Code`;
