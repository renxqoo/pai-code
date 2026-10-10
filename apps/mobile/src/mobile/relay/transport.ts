/**
 * relay 传输（T58 P2）：手机 → hub-relay(WSS) → hub-gateway → host 的设备侧客户端。
 *
 * 设计（对照 LAN ws-client 已修语义 + x-harness remote-client 装配）：
 * - socket 段用 RN 全局 WebSocket（平台原生分帧/掩码/pong）；上层 ingest/outbox/
 *   ACK/chunk 重组逻辑同构 x-harness connect.ts
 * - L3 信封 + ratchet codec（@x3code/relay-protocol）；事件经 dispatch 上抛
 * - 重连退避 1s→30s + 连接身份守卫（旧 socket 迟到 close 不动现行状态）
 * - 心跳：20s ping、2 次未收任何帧主动断开（半开探测——relay 无应用层 pong，
 *   以「任意入站帧」为活性证据）
 * - ratchet 边界持久化注入式（MMKV 同步写在 App 装配层；测试内存实现）
 */
import {
  ChunkReassemblerPool,
  commandError,
  decodeEnvelope,
  encodeEnvelope,
  parseFrame,
  type Frame,
  type ResponseBody,
} from '@x3code/relay-protocol';


export interface RelayCodec {
  /** 明文帧 JSON → {payload, nonce}；失败 null（不发） */
  seal(frameJson: string): Promise<{ payload: string; nonce: string } | null>;
  /** 密文 → 明文帧 JSON；失败 null（丢弃+计数） */
  open(payloadBase64: string, nonceBase64: string): Promise<string | null>;
}

export type RelayStatus = 'disconnected' | 'connecting' | 'connected' | 'ready';
// 'ready' = connected 的别名（首帧互换取证后置位）——UI 端既有 'ready' 检查零改动

export interface RelayTransportCallbacks {
  onStatus(status: RelayStatus, detail: string): void;
  onFrame(frame: Frame): void;
  /** relay 控制行（error=no-route 等）——观测面 */
  onRelayMessage(line: string): void;
}

/** WS 实现注入（生产 RN 全局 WebSocket；测试内存对）。 */
export type SocketFactory = (url: string) => RelaySocketLike;

export interface RelaySocketLike {
  send(data: string): void;
  close(): void;
  onOpen(cb: () => void): void;
  onMessage(cb: (data: string) => void): void;
  onClose(cb: () => void): void;
  onError(cb: () => void): void;
}

export interface RelayTransportOptions {
  relayUrl: string;
  relayToken: string;
  deviceId: string;
  installationId: string;
  codec: RelayCodec;
  socketFactory: SocketFactory;
  callbacks: RelayTransportCallbacks;
  now?(): number;
}

export interface RelayTransport {
  sendCommand(spec: { command: string; id: string; args?: Record<string, unknown> }): Promise<boolean>;
  sendFrame(frame: Frame): Promise<boolean>;
  /** 断线窗口命令重发（重连后由装配层调用）。 */
  resendOutbox(): Promise<void>;
  outboxIds(): string[];
  waitResponse(id: string, timeoutMs?: number): Promise<ResponseBody>;
  connected(): boolean;
  status(): RelayStatus;
  connect(): void;
  stop(): void;
}

const HEARTBEAT_INTERVAL_MS = 20_000;
const RESPONSE_DEFAULT_TIMEOUT_MS = 30_000;
/** 连续拨号失败上限（鉴权拒绝的可靠代理信号——RN 无握手状态码透传）。 */
const CONNECT_EXHAUSTION_LIMIT = 5;

export function createRelayTransport(options: RelayTransportOptions): RelayTransport {
  const { codec, callbacks, socketFactory } = options;
  const now = (): number => (options.now !== undefined ? options.now() : Date.now());
  let socket: RelaySocketLike | null = null;
  let status: RelayStatus = 'disconnected';
  let stopped = false;
  let backoffMs = 1000;
  let connectFailures = 0;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  let silentBeats = 0;
  let lastInboundAt = 0;
  let commandSeq = 1;
  let consecutiveTimeouts = 0;
  let ackSeq = 1;
  const commandOutbox = new Map<string, Frame>();
  const commandSentAt = new Map<string, number>();
  /** 命令出箱 TTL：过期不再重发（迟到执行防护——M1）。 */
  const OUTBOX_TTL_MS = 60_000;
  const perStreamLastSeq = new Map<string, number>();
  const chunkPool = new ChunkReassemblerPool();
  const responseWaiters = new Map<string, { resolve: (r: ResponseBody) => void; timer: ReturnType<typeof setTimeout> }>();

  const setStatus = (next: RelayStatus, detail: string): void => {
    status = next;
    callbacks.onStatus(next, detail);
  };

  const sendRaw = (line: string): boolean => {
    if (socket === null || (status !== 'connected' && status !== 'ready')) return false;
    try {
      socket.send(line);
      return true;
    } catch {
      // 半死连接 send 抛：视为断（close 处理器接管）
      try {
        socket.close();
      } catch {
        // 已死
      }
      return false;
    }
  };

  /** ACK 合并窗口：32 帧或 250ms flush（H 级高频流的水位推进）。 */
  let ackDebt = 0;
  let ackTimer: ReturnType<typeof setTimeout> | null = null;
  const flushAcks = (): void => {
    ackTimer = null;
    if (ackDebt === 0) return;
    ackDebt = 0;
    const acks = [...perStreamLastSeq.entries()].map(([streamId, upTo]) => ({ streamId, upTo }));
    void sendSealed({ kind: 'ack', streamId: 'ack', seq: ackSeq++, body: { acks } });
  };
  const noteAck = (): void => {
    ackDebt += 1;
    if (ackDebt >= 32) {
      flushAcks();
      return;
    }
    ackTimer ??= setTimeout(flushAcks, 250);
  };

  const sendSealed = async (frame: Frame): Promise<boolean> => {
    const sealed = await codec.seal(JSON.stringify(frame));
    if (sealed === null) return false;
    const env = encodeEnvelope({ v: 1, from: `dev_${options.deviceId}`, to: `gw_${options.installationId}`, payload: sealed.payload, nonce: sealed.nonce });
    return sendRaw(env);
  };

  const stopHeartbeat = (): void => {
    if (heartbeatTimer !== null) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
  };

  const startHeartbeat = (): void => {
    stopHeartbeat();
    // 保活由传输层承担（relay 每 10s WS ping、RN 原生自动回 pong）；应用层不再做
    // 自杀式判活（协议无自定义 ping 帧——空闲连接 60s 强拆环已废，半开由 TCP/服务端
    // close 驱动重连）。定时器仅复位观测计数。
    heartbeatTimer = setInterval(() => {
      void silentBeats;
      void lastInboundAt;
    }, HEARTBEAT_INTERVAL_MS);
  };

  const scheduleReconnect = (): void => {
    if (stopped) return;
    // 连接耗尽终态（R3 M8：401 时 RN 拿不到握手码——连续 N 次连败是可靠信号；
    // 装配层据此做一次 token 续期重连，不在退避环打转）
    connectFailures += 1;
    if (connectFailures >= CONNECT_EXHAUSTION_LIMIT) {
      connectFailures = 0;
      setStatus('disconnected', 'connect-exhausted');
      return;
    }
    if (reconnectTimer !== null) return;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      if (!stopped) dial();
    }, backoffMs);
    backoffMs = Math.min(backoffMs * 2, 30_000);
  };

  const failAllWaiters = (): void => {
    for (const waiter of responseWaiters.values()) {
      clearTimeout(waiter.timer);
      waiter.resolve({ id: '', command: '', success: false, error: commandError('disconnected') });
    }
    responseWaiters.clear();
  };

  const ingest = async (line: string): Promise<void> => {
    lastInboundAt = now();
    const env = decodeEnvelope(line);
    if (env === null) return;
    if (env.from === 'relay') {
      callbacks.onRelayMessage(line);
      return;
    }
    const plaintext = await codec.open(env.payload, env.nonce);
    if (plaintext === null) return;
    const frame = parseFrame(plaintext);
    if (frame === null) return;
    if (frame.kind === 'chunk') {
      const body = frame.body as { segmentId: number; segmentCount: number; data: string };
      const whole = chunkPool.add({ streamId: frame.streamId, seq: frame.seq, segmentId: body.segmentId, segmentCount: body.segmentCount, data: body.data });
      if (whole === null) return;
      const wholeFrame = parseFrame(whole);
      if (wholeFrame === null) return;
      deliver(wholeFrame);
      return;
    }
    deliver(frame);
  };

  const deliver = (frame: Frame): void => {
    if (frame.kind === 'response') {
      consecutiveTimeouts = 0;
      const body = frame.body as ResponseBody;
      const waiter = responseWaiters.get(body.id);
      if (waiter !== undefined) {
        responseWaiters.delete(body.id);
        clearTimeout(waiter.timer);
        waiter.resolve(body);
        commandOutbox.delete(body.id);
        commandSentAt.delete(body.id);
      }
    }
    perStreamLastSeq.set(frame.streamId, Math.max(perStreamLastSeq.get(frame.streamId) ?? 0, frame.seq));
    noteAck();
    callbacks.onFrame(frame);
  };

  const dial = (): void => {
    if (reconnectTimer !== null) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    if (socket !== null) {
      const stale = socket;
      socket = null;
      try {
        stale.close();
      } catch {
        // 半死
      }
    }
    stopHeartbeat();
    failAllWaiters();
    setStatus('connecting', options.relayUrl);
    let ws: RelaySocketLike;
    try {
      ws = socketFactory(options.relayUrl);
    } catch {
      setStatus('disconnected', 'bad_url');
      scheduleReconnect();
      return;
    }
    socket = ws;
    ws.onOpen(() => {
      if (socket !== ws) return;
      backoffMs = 1000;
      connectFailures = 0;
      setStatus('ready', 'open');
      startHeartbeat();
      // 重连后重发未结算命令（App 装配层也可显式调用）
      void resendOutboxInternal();
    });
    ws.onMessage((data) => {
      if (socket !== ws) return;
      void ingest(data);
    });
    ws.onClose(() => {
      if (socket !== ws) return;
      socket = null;
      stopHeartbeat();
      setStatus('disconnected', 'closed');
      scheduleReconnect();
    });
    ws.onError(() => {
      if (socket !== ws) return;
      ws.close();
    });
  };

  const resendOutboxInternal = async (): Promise<void> => {
    const expired: string[] = [];
    for (const [id, frame] of commandOutbox.entries()) {
      const sentAt = commandSentAt.get(id);
      if (sentAt !== undefined && now() - sentAt > OUTBOX_TTL_MS) {
        expired.push(id);
        continue;
      }
      const ok = await sendSealed(frame);
      if (!ok) return;
    }
    for (const id of expired) {
      commandOutbox.delete(id);
      commandSentAt.delete(id);
    }
  };

  return {
    async sendCommand(spec) {
      const frame: Frame = { kind: 'command', streamId: `cmd:${options.deviceId}`, seq: commandSeq++, body: { command: spec.command, id: spec.id, args: spec.args ?? {} } };
      const sent = await sendSealed(frame);
      if (!sent) {
        // 断连期失败不留箱（M-5：重连后重复执行面）；已通才入箱（重连重发语义保留）
        return false;
      }
      commandOutbox.set(spec.id, frame);
      commandSentAt.set(spec.id, now());
      return true;
    },
    async sendFrame(frame) {
      return sendSealed(frame);
    },
    async resendOutbox() {
      await resendOutboxInternal();
    },
    outboxIds: () => [...commandOutbox.keys()],
    waitResponse(id, timeoutMs = RESPONSE_DEFAULT_TIMEOUT_MS) {
      return new Promise((resolve) => {
        const existing = responseWaiters.get(id);
        if (existing !== undefined) {
          clearTimeout(existing.timer);
          responseWaiters.delete(id);
        }
        const timer = setTimeout(() => {
          responseWaiters.delete(id);
          resolve({ id, command: '', success: false, error: commandError('timeout') });
          // 半开恢复（R2 H-5）：连续超时 = 连接死而未察——强制断开触发 onClose→重连
          consecutiveTimeouts += 1;
          if (consecutiveTimeouts >= 2) {
            consecutiveTimeouts = 0;
            try {
              socket?.close();
            } catch {
              // 已死
            }
          }
        }, timeoutMs);
        responseWaiters.set(id, { resolve, timer });
      });
    },
    connected: () => status === 'connected' || status === 'ready',
    status: () => status,
    connect() {
      stopped = false;
      backoffMs = 1000;
      dial();
    },
    stop() {
      stopped = true;
      if (reconnectTimer !== null) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      stopHeartbeat();
      failAllWaiters();
      try {
        socket?.close();
      } catch {
        // 已死
      }
      socket = null;
      setStatus('disconnected', 'stopped');
    },
  };
}

/** RN WebSocket 适配（query 带 token——relay 鉴权面）。 */
export function rnSocketFactory(url: string, token: string): RelaySocketLike {
  const ws = new WebSocket(`${url}?token=${encodeURIComponent(token)}`);
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
