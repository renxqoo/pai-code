/**
 * mobile bridge 服务（T57 §4）：WS 服务器 + 会话状态机（pair/auth → invoke 路由 + 事件扇出）。
 * 与渲染层 IPC 同门：invoke 走 createApiRoutes().invoke（ApiSchemas zod 校验单点）；
 * 事件走主进程 emit 泵的第二扇（EventFanout）。
 *
 * 资源防线（对抗审查 H2/H4/M1/M4）：wss 异步 error 收敛不崩进程；maxPayload 1MiB；
 * 连接上限与鉴权超时防未鉴权 DoS；重复 auth 先 detach 旧 sink 防泄漏；stop() 用
 * terminate 快断（不与移动端做优雅关闭握手）。续传：auth 帧可带 lastSeq（客户端
 * 已见水位），重连只重放缺口而非全环。
 */
import { WebSocketServer, type WebSocket } from 'ws';

import {
  BridgeClientFrameSchema,
  type ApiOutcome,
  type BridgeServerFrame,
  type BridgeServerInfo,
  type UiEvent,
} from '@paiapp/contracts';

import { createEventFanout, type EventSink } from './event-fanout';
import { createPairingGate, type PairingGate, type PairingDeps } from './pairing';

/** 单帧字节上限（契约帧是小 JSON；ws 缺省 100MiB 是 DoS 面）。 */
const MAX_PAYLOAD_BYTES = 1 << 20;
/** 并发连接上限（配对面 + 已鉴权共用；超限新连接即断）。 */
const MAX_CONNECTIONS = 8;
/** 鉴权超时（ms）：窗口内未完成 auth 的连接直接断开。 */
const AUTH_TIMEOUT_MS = 10_000;

export interface BridgeDeps extends PairingDeps {
  /** 监听端口（缺省 8787）。 */
  port?: number;
  /** 既有 invoke 路由（pai:invoke 同一处理面）。 */
  invoke(method: string, params: unknown): Promise<unknown>;
  /** serverInfo 数据源（版本 + host 相位快照）。 */
  serverInfo(): BridgeServerInfo;
  /** WS 实现注入（测试用内存对；缺省 ws 包 WebSocketServer）。 */
  makeServer?(options: { port: number; host: string }): WebSocketServerLike;
  now(): number;
  log(message: string): void;
}

export interface WebSocketLike {
  on(event: 'message', listener: (data: unknown) => void): void;
  on(event: 'close', listener: () => void): void;
  on(event: 'error', listener: (error: Error) => void): void;
  send(data: string): void;
  close(): void;
  /** 立即断开（不做优雅关闭握手——stop/超时路径专用）。 */
  terminate?(): void;
}

export interface WebSocketServerLike {
  on(event: 'connection', listener: (socket: WebSocketLike) => void): void;
  on(event: 'error', listener: (error: Error) => void): void;
  close(): Promise<void> | void;
}

interface Session {
  socket: WebSocketLike;
  authenticated: boolean;
  deviceName: string | null;
  lastAckSeq: number;
  pendingInvokes: Map<string, Promise<void>>;
  sink: EventSink | null;
  authTimer: ReturnType<typeof setTimeout> | null;
}

export interface MobileBridge {
  /** 生成配对码（桌面 UI 展示；覆盖旧码）。 */
  pairCode(): { code: string; expiresAt: number };
  /** 配对面状态观测。 */
  readonly pairing: PairingGate;
  /** 已连接设备清单。 */
  connectedDevices(): string[];
  /** 已配对设备名单（含离线；去重）。 */
  pairedDevices(): string[];
  /** 主进程事件泵入口。 */
  publishEvent(event: UiEvent): void;
  stop(): Promise<void>;
}

export function createMobileBridge(deps: BridgeDeps): MobileBridge {
  const fanout = createEventFanout();
  const pairing = createPairingGate(deps);
  const sessions = new Set<Session>();
  const listenOptions = { port: deps.port ?? 8787, host: '0.0.0.0', maxPayload: MAX_PAYLOAD_BYTES };
  const wss: WebSocketServerLike = deps.makeServer !== undefined ? deps.makeServer(listenOptions) : new WebSocketServer(listenOptions);

  // wss 异步 error（端口占用/重建竞态）必须收敛：无监听的 'error' 事件会崩主进程
  wss.on('error', (error) => {
    deps.log(`mobile_bridge_error:${error.message}`);
  });

  const send = (socket: WebSocketLike, frame: BridgeServerFrame): void => {
    try {
      socket.send(JSON.stringify(frame));
    } catch {
      // 连接半死：发送失败视为断（close 处理器接管清理）
    }
  };

  const hardClose = (socket: WebSocketLike): void => {
    if (socket.terminate !== undefined) socket.terminate();
    else socket.close();
  };

  wss.on('connection', (socket) => {
    if (sessions.size >= MAX_CONNECTIONS) {
      // 连接上限：直接快断（未鉴权连接不许挤占资源）
      hardClose(socket);
      deps.log('mobile_bridge_conn_rejected:limit');
      return;
    }
    const session: Session = { socket, authenticated: false, deviceName: null, lastAckSeq: 0, pendingInvokes: new Map(), sink: null, authTimer: null };
    sessions.add(session);
    // 鉴权超时：窗口内未 auth 的连接断开（未鉴权连接不许长挂）
    session.authTimer = setTimeout(() => {
      if (!session.authenticated) {
        deps.log('mobile_bridge_auth_timeout');
        hardClose(socket);
      }
    }, AUTH_TIMEOUT_MS);

    socket.on('message', (data) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(String(data));
      } catch {
        deps.log('mobile_frame_dropped:not_json');
        return;
      }
      const frame = BridgeClientFrameSchema.safeParse(parsed);
      if (!frame.success) {
        deps.log('mobile_frame_dropped:shape');
        return;
      }

      if (frame.data.type === 'ping') {
        send(socket, { type: 'pong' });
        return;
      }
      if (frame.data.type === 'pair') {
        const result = pairing.pair(frame.data.code, frame.data.deviceName);
        if (result.ok) {
          deps.log(`mobile_paired:${frame.data.deviceName}`);
          send(socket, { type: 'paired', token: result.token, serverInfo: deps.serverInfo() });
        } else {
          deps.log(`mobile_pair_failed:${result.reason}`);
          // 未鉴方面：失败原因泛化（不做「当前是否有有效码」预言机）
          send(socket, { type: 'pairFailed', reason: result.reason === 'code_mismatch' || result.reason === 'code_expired' ? 'pair_rejected' : result.reason });
        }
        return;
      }
      if (frame.data.type === 'auth') {
        const device = pairing.authenticate(frame.data.token);
        if (device === null) {
          send(socket, { type: 'authFailed', reason: 'unknown_token' });
          return;
        }
        // 重复 auth：先摘旧 sink 再挂新（防 sink 泄漏与事件重复投递）
        if (session.sink !== null) fanout.detach(session.sink);
        if (session.authTimer !== null) {
          clearTimeout(session.authTimer);
          session.authTimer = null;
        }
        session.authenticated = true;
        session.deviceName = device;
        // 客户端声明已见水位（重连续传）：auth.lastSeq 在场则从它之后重放
        const since = typeof (frame.data as { lastSeq?: unknown }).lastSeq === 'number' ? (frame.data as { lastSeq: number }).lastSeq : session.lastAckSeq;
        session.lastAckSeq = Math.max(session.lastAckSeq, since);
        session.sink = {
          sendEvent: (seq, event) => send(socket, { type: 'event', seq, event }),
          lastAck: () => session.lastAckSeq,
        };
        fanout.attach(session.sink, session.lastAckSeq);
        deps.log(`mobile_connected:${device}`);
        send(socket, { type: 'ready', serverInfo: deps.serverInfo() });
        return;
      }
      if (!session.authenticated) return; // 鉴权前仅 pair/auth/ping

      if (frame.data.type === 'ack') {
        session.lastAckSeq = Math.max(session.lastAckSeq, frame.data.seq);
        fanout.acknowledge(session.sink as EventSink, frame.data.seq);
        return;
      }
      // invoke：路由 → invokeResult（id 关联）
      const { id, method, params } = frame.data;
      const pending = (async () => {
        const outcome = (await deps.invoke(method, params ?? {})) as ApiOutcome<never>;
        send(socket, outcome.ok ? { type: 'invokeResult', id, ok: true, data: outcome.data } : { type: 'invokeResult', id, ok: false, error: outcome.error });
      })().catch(() => {
        send(socket, { type: 'invokeResult', id, ok: false, error: { kind: 'transient', face: 'host_unavailable' } });
      }).finally(() => {
        session.pendingInvokes.delete(id);
      });
      session.pendingInvokes.set(id, pending);
    });

    const cleanup = (): void => {
      sessions.delete(session);
      if (session.sink !== null) fanout.detach(session.sink);
      if (session.authTimer !== null) clearTimeout(session.authTimer);
      if (session.deviceName !== null) deps.log(`mobile_disconnected:${session.deviceName}`);
    };
    socket.on('close', cleanup);
    socket.on('error', cleanup);
  });

  return {
    pairCode() {
      const issued = pairing.issueCode();
      return { code: issued.code, expiresAt: issued.expiresAt };
    },
    pairing,
    connectedDevices: () => [...sessions].filter((s) => s.authenticated).map((s) => s.deviceName ?? 'unknown'),
    pairedDevices: () => [...new Set(deps.knownTokens().values())],
    publishEvent: (event) => fanout.publish(event),
    async stop() {
      for (const session of sessions) {
        if (session.authTimer !== null) clearTimeout(session.authTimer);
        // 不等在途 invoke、不做优雅握手（移动端应答 close 帧不可依赖）——直接快断
        hardClose(session.socket);
      }
      sessions.clear();
      await wss.close();
    },
  };
}

export type { WebSocket };
