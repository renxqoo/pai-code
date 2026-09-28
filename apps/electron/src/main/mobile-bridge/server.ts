/**
 * mobile bridge 服务（T57 §4）：WS 服务器 + 会话状态机（pair/auth → invoke 路由 + 事件扇出）。
 * 与渲染层 IPC 同门：invoke 走 createApiRoutes().invoke（ApiSchemas zod 校验单点）；
 * 事件走主进程 emit 泵的第二扇（EventFanout）。
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
}

export interface WebSocketServerLike {
  on(event: 'connection', listener: (socket: WebSocketLike) => void): void;
  close(): Promise<void> | void;
}

interface Session {
  socket: WebSocketLike;
  authenticated: boolean;
  deviceName: string | null;
  lastAckSeq: number;
  pendingInvokes: Map<string, Promise<void>>;
  sink: EventSink | null;
}

export interface MobileBridge {
  /** 生成配对码（桌面 UI 展示；覆盖旧码）。 */
  pairCode(): { code: string; expiresAt: number };
  /** 配对面状态观测。 */
  readonly pairing: PairingGate;
  /** 已连接设备清单。 */
  connectedDevices(): string[];
  /** 主进程事件泵入口。 */
  publishEvent(event: UiEvent): void;
  stop(): Promise<void>;
}

export function createMobileBridge(deps: BridgeDeps): MobileBridge {
  const fanout = createEventFanout();
  const pairing = createPairingGate(deps);
  const sessions = new Set<Session>();
  const listenOptions = { port: deps.port ?? 8787, host: '0.0.0.0' };
  const wss: WebSocketServerLike = deps.makeServer !== undefined ? deps.makeServer(listenOptions) : new WebSocketServer(listenOptions);

  const send = (socket: WebSocketLike, frame: BridgeServerFrame): void => {
    try {
      socket.send(JSON.stringify(frame));
    } catch {
      // 连接半死：发送失败视为断（close 处理器接管清理）
    }
  };

  wss.on('connection', (socket) => {
    const session: Session = { socket, authenticated: false, deviceName: null, lastAckSeq: 0, pendingInvokes: new Map(), sink: null };
    sessions.add(session);

    socket.on('message', (data) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(String(data));
      } catch {
        return; // 非 JSON 帧丢弃
      }
      const frame = BridgeClientFrameSchema.safeParse(parsed);
      if (!frame.success) return; // 形状违约丢弃（计数在 log 面）

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
          send(socket, { type: 'pairFailed', reason: result.reason });
        }
        return;
      }
      if (frame.data.type === 'auth') {
        const device = pairing.authenticate(frame.data.token);
        if (device === null) {
          send(socket, { type: 'authFailed', reason: 'unknown_token' });
          return;
        }
        session.authenticated = true;
        session.deviceName = device;
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
    publishEvent: (event) => fanout.publish(event),
    async stop() {
      for (const session of sessions) {
        for (const pending of session.pendingInvokes.values()) await pending.catch(() => undefined);
        session.socket.close();
      }
      sessions.clear();
      await wss.close();
    },
  };
}

export type { WebSocket };
