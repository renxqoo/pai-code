/**
 * WS 传输（T57 §5）：连桌面端 mobile bridge。
 *
 * 可靠性基线（对抗审查 H1/H2/H4/H6 修复）：
 * - connect/dial 先拆旧连接（清 timer + close），回调带身份守卫（旧 socket 迟到
 *   close 不再篡改现行状态）
 * - auth 带 lastSeq（服务端按水位续传缺口）；ready 时复位本端 seq 窗口（服务端
 *   重启后 seq 回卷不再黑洞）
 * - ready 后 20s 心跳，2 次未 pong 主动断开触发重连（半开连接探测）
 * - pair 等待 open 后发送（CONNECTING 态 send 抛异常）；send 包 try/catch
 * - 重连退避 1s→30s；invoke pending 表超时
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

type PairOutcome = { ok: true; token: string; serverInfo: BridgeServerInfo } | { ok: false; reason: string };

export interface WsTransportCallbacks {
  onStatus(status: BridgeStatus, info?: BridgeServerInfo): void;
  onEvent(event: unknown): void;
  /** 配对码被拒/令牌失效（需重新配对）。 */
  onAuthFailed(reason: string): void;
}

export interface WsTransport {
  connect(url: string, token: string | null): void;
  invoke(method: string, params: unknown, timeoutMs?: number): Promise<{ ok: boolean; data?: unknown; error?: { kind: string } & Record<string, unknown> }>;
  pair(code: string, deviceName: string): Promise<PairOutcome>;
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

const DEFAULT_TIMEOUT_MS = 30_000;
const HEARTBEAT_INTERVAL_MS = 20_000;
const HEARTBEAT_MISSES = 2;
const PAIR_TIMEOUT_MS = 15_000;

/** 帧字段安全取串（object → ''——不下 [object Object]）。 */
function textOf(value: unknown): string {
  if (typeof value === 'string') return value;
  return '';
}

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
  let pairWaiter: ((result: PairOutcome) => void) | null = null;
  let pairTimer: ReturnType<typeof setTimeout> | null = null;
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  let missedPongs = 0;
  let socketOpen = false;

  const setStatus = (next: BridgeStatus, info?: BridgeServerInfo): void => {
    status = next;
    callbacks.onStatus(next, info);
  };

  const stopHeartbeat = (): void => {
    if (heartbeatTimer !== null) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
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

  const failAllPending = (): void => {
    for (const entry of pending.values()) {
      clearTimeout(entry.timer);
      entry.resolve({ ok: false, error: { kind: 'transient', face: 'host_unavailable' } });
    }
    pending.clear();
  };

  const settlePair = (result: PairOutcome): void => {
    if (pairTimer !== null) {
      clearTimeout(pairTimer);
      pairTimer = null;
    }
    const waiter = pairWaiter;
    pairWaiter = null;
    waiter?.(result);
  };

  const handleFrame = (raw: string): void => {
    let frame: Record<string, unknown>;
    try {
      frame = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return;
    }
    const type = frame['type'];
    if (type === 'pong') {
      missedPongs = 0;
      return;
    }
    if (type === 'paired') {
      settlePair({ ok: true, token: textOf(frame['token']), serverInfo: frame['serverInfo'] as BridgeServerInfo });
      return;
    }
    if (type === 'pairFailed') {
      settlePair({ ok: false, reason: textOf(frame['reason']) || 'unknown' });
      return;
    }
    if (type === 'authFailed') {
      const reason = textOf(frame['reason']) || 'unknown';
      settlePair({ ok: false, reason });
      callbacks.onAuthFailed(reason);
      stopped = true;
      socket?.close();
      setStatus('disconnected');
      return;
    }
    if (type === 'ready') {
      backoff = 1000;
      missedPongs = 0;
      // 新连接新 seq 域：复位本端窗口（服务端重启 seq 回卷后不再黑洞）
      lastEventSeq = 0;
      setStatus('ready', frame['serverInfo'] as BridgeServerInfo | undefined);
      startHeartbeat();
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
        socket?.send(JSON.stringify({ type: 'ack', seq }));
      }
    }
  };

  const startHeartbeat = (): void => {
    stopHeartbeat();
    heartbeatTimer = setInterval(() => {
      if (missedPongs >= HEARTBEAT_MISSES) {
        // 半开连接：主动断开走重连路径（不等 30s invoke 超时）
        socket?.close();
        return;
      }
      missedPongs += 1;
      try {
        socket?.send(JSON.stringify({ type: 'ping' }));
      } catch {
        socket?.close();
      }
    }, HEARTBEAT_INTERVAL_MS);
  };

  const dial = (): void => {
    if (url.length === 0) return;
    // 拆旧连接：清重连 timer、关旧 socket（回调身份守卫使迟到 close 无害）
    if (reconnectTimer !== null) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    socketOpen = false;
    if (socket !== null) {
      const stale = socket;
      socket = null;
      try {
        stale.close();
      } catch {
        // 半死连接 close 抛错忽略
      }
    }
    stopHeartbeat();
    setStatus('connecting');
    let ws: RnSocketLike;
    try {
      ws = socketFactory(url);
    } catch {
      // 非法 URL 同步抛：收敛为断线 + 重连（不崩 React effect）
      setStatus('disconnected');
      scheduleReconnect();
      return;
    }
    socket = ws;
    ws.onOpen(() => {
      if (socket !== ws) return;
      socketOpen = true;
      if (token !== null) {
        setStatus('authenticating');
        try {
          // 续传水位：服务端只重放 lastSeq 之后的事件（而非全环）
          ws.send(JSON.stringify({ type: 'auth', token, lastSeq: lastEventSeq }));
        } catch {
          ws.close();
        }
      }
      // 无令牌：连接仅用于配对（pair 等 open 后发送）
    });
    ws.onMessage((data) => {
      if (socket !== ws) return;
      handleFrame(data);
    });
    ws.onClose(() => {
      if (socket !== ws) return; // 身份守卫：旧 socket 迟到 close 不动现行状态
      socket = null;
      socketOpen = false;
      stopHeartbeat();
      failAllPending();
      setStatus('disconnected');
      scheduleReconnect();
    });
    ws.onError(() => {
      if (socket !== ws) return;
      ws.close();
    });
  };

  return {
    connect(nextUrl, nextToken) {
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
        // 单槽守卫：并发 pair 立即拒绝旧等待者（不再悬挂）
        if (pairWaiter !== null) settlePair({ ok: false, reason: 'busy' });
        pairWaiter = resolve;
        // 发送守卫：CONNECTING 态 send 抛异常——轮询到 open 后发送
        const started = Date.now();
        const poll = (): void => {
          if (pairWaiter !== resolve) return;
          if (socketOpen) {
            try {
              socket?.send(JSON.stringify({ type: 'pair', code, deviceName }));
            } catch {
              settlePair({ ok: false, reason: 'not_open' });
            }
            return;
          }
          if (Date.now() - started > PAIR_TIMEOUT_MS) {
            settlePair({ ok: false, reason: 'timeout' });
            return;
          }
          setTimeout(poll, 100);
        };
        poll();
        pairTimer = setTimeout(() => {
          if (pairWaiter === resolve) settlePair({ ok: false, reason: 'timeout' });
        }, PAIR_TIMEOUT_MS);
      });
    },
    disconnect() {
      stopped = true;
      if (reconnectTimer !== null) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      stopHeartbeat();
      settlePair({ ok: false, reason: 'disconnected' });
      failAllPending();
      socket?.close();
      socket = null;
      socketOpen = false;
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

/** 缺省 bridge URL 构造（ws://host:port）。 */
export function bridgeUrl(host: string, port = 8787): string {
  return `ws://${host}:${port}`;
}

export const DEVICE_NAME = `${Platform.OS === 'ios' ? 'iPhone' : 'Android'} · Pai Code`;
