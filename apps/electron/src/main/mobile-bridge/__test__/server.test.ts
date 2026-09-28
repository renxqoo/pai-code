import { describe, expect, test } from 'bun:test';

import type { BridgeServerFrame } from '@paiapp/contracts';

import { createMobileBridge, type WebSocketLike, type WebSocketServerLike } from '../server';

/** 内存 WS 对：server 侧 makeServer 注入；client 侧 socket 模拟器。 */
interface MemoryHarness {
  serverFrames: BridgeServerFrame[];
  connect(): MemorySocket;
}

interface MemorySocket extends WebSocketLike {
  /** 客户端发送上行帧（JSON 字符串）。 */
  clientSend(frame: unknown): void;
  /** 服务端下行帧（已解析）。 */
  frames(): BridgeServerFrame[];
  /** 等待某帧类型到达（轮询）。 */
  waitFor(pred: (frame: BridgeServerFrame) => boolean, ms?: number): Promise<BridgeServerFrame>;
}

function makeMemoryServer(): WebSocketServerLike & MemoryHarness {
  const serverFrames: BridgeServerFrame[] = [];
  const listeners: Array<(socket: WebSocketLike) => void> = [];
  return {
    serverFrames,
    on(event, listener) {
      if (event === 'connection') listeners.push(listener);
    },
    close() {},
    connect(): MemorySocket {
      let messageHandler: ((data: unknown) => void) | null = null;
      const closeHandlers: Array<() => void> = [];
      const received: BridgeServerFrame[] = [];
      const socket: MemorySocket = {
        on(event, listener) {
          if (event === 'message') messageHandler = listener;
          if (event === 'close') closeHandlers.push(listener);
        },
        send(data) {
          const frame = JSON.parse(data) as BridgeServerFrame;
          received.push(frame);
          serverFrames.push(frame);
        },
        close() {
          for (const handler of closeHandlers) handler();
        },
        clientSend(frame) {
          messageHandler?.(JSON.stringify(frame));
        },
        frames: () => received,
        async waitFor(pred, ms = 1000) {
          const started = Date.now();
          for (;;) {
            const hit = received.find(pred);
            if (hit !== undefined) break;
            if (Date.now() - started > ms) throw new Error(`bridge frame timeout: ${JSON.stringify(received)}`);
            await new Promise((r) => {
              setTimeout(r, 10);
            });
          }
          return received.find(pred) as BridgeServerFrame;
        },
      };
      for (const listener of listeners) listener(socket);
      return socket;
    },
  };
}

function makeDeps(over: { invoke?: (method: string, params: unknown) => Promise<unknown> } = {}) {
  const tokens = new Map<string, string>();
  const memory = makeMemoryServer();
  const bridge = createMobileBridge({
    now: () => Date.now(),
    persistToken: (token, device) => tokens.set(token, device),
    knownTokens: () => tokens,
    invoke:
      over.invoke ??
      ((method) => ({ ok: true, data: method === 'app/bootstrap' ? { sessions: [] } : null })),
    serverInfo: () => ({ appVersion: '0.1.0', hostPhase: 'ready' }),
    makeServer: () => memory,
    log: () => {},
  });
  return { bridge, memory };
}

describe('bridge 会话状态机', () => {
  test('配对全流程：pair → paired(token) → auth → ready', async () => {
    const { bridge, memory } = makeDeps();
    const socket = memory.connect();
    const code = bridge.pairCode();
    socket.clientSend({ type: 'pair', code: code.code, deviceName: 'iPhone 15' });
    const paired = await socket.waitFor((f) => f.type === 'paired');
    expect(paired).toMatchObject({ type: 'paired' });
    if (paired.type !== 'paired') return;
    socket.clientSend({ type: 'auth', token: paired.token });
    await socket.waitFor((f) => f.type === 'ready');
    expect(bridge.connectedDevices()).toEqual(['iPhone 15']);
  });

  test('错码 pairFailed；未知令牌 authFailed；鉴权前 invoke 无响应', async () => {
    const { bridge, memory } = makeDeps();
    void bridge;
    const socket = memory.connect();
    socket.clientSend({ type: 'pair', code: '999999', deviceName: 'x' });
    const failed = await socket.waitFor((f) => f.type === 'pairFailed');
    expect(failed).toMatchObject({ type: 'pairFailed' });
    socket.clientSend({ type: 'auth', token: 'nope' });
    await socket.waitFor((f) => f.type === 'authFailed');
    // 未鉴权 invoke：静默丢弃
    socket.clientSend({ type: 'invoke', id: 'c1', method: 'app/bootstrap', params: {} });
    await new Promise((r) => {
      setTimeout(r, 50);
    });
    expect(socket.frames().some((f) => f.type === 'invokeResult')).toBe(false);
  });

  test('鉴权后 invoke 路由到既有 ApiRoutes（ok 判别回传）', async () => {
    const { bridge, memory } = makeDeps({
      invoke: (method) =>
        method === 'model/list'
          ? Promise.resolve({ ok: true, data: [{ provider: 'p', modelId: 'm' }] })
          : Promise.resolve({ ok: false, error: { kind: 'transient', face: 'host_unavailable' } }),
    });
    const socket = memory.connect();
    const code = bridge.pairCode();
    socket.clientSend({ type: 'pair', code: code.code, deviceName: 'd' });
    const paired = await socket.waitFor((f) => f.type === 'paired');
    if (paired.type !== 'paired') throw new Error('unreachable');
    socket.clientSend({ type: 'auth', token: paired.token });
    await socket.waitFor((f) => f.type === 'ready');
    socket.clientSend({ type: 'invoke', id: 'm1', method: 'model/list', params: {} });
    const okResult = await socket.waitFor((f) => f.type === 'invokeResult' && f.id === 'm1');
    expect(okResult).toMatchObject({ type: 'invokeResult', id: 'm1', ok: true });
    socket.clientSend({ type: 'invoke', id: 'm2', method: 'session/state', params: { threadId: 't' } });
    const errResult = await socket.waitFor((f) => f.type === 'invokeResult' && f.id === 'm2');
    expect(errResult.ok).toBe(false);
  });

  test('事件扇出：鉴权连接收到 publishEvent；ack 水位后重连续传缺口', async () => {
    const { bridge, memory } = makeDeps();
    const socket = memory.connect();
    const code = bridge.pairCode();
    socket.clientSend({ type: 'pair', code: code.code, deviceName: 'd' });
    const paired = await socket.waitFor((f) => f.type === 'paired');
    if (paired.type !== 'paired') throw new Error('unreachable');
    socket.clientSend({ type: 'auth', token: paired.token });
    await socket.waitFor((f) => f.type === 'ready');
    bridge.publishEvent({ type: 'turnStarted', threadId: 't1', at: 1 });
    const e1 = await socket.waitFor((f) => f.type === 'event');
    expect(e1).toMatchObject({ type: 'event', seq: 1 });
    socket.clientSend({ type: 'ack', seq: 1 });
    bridge.publishEvent({ type: 'turnStarted', threadId: 't2', at: 2 });
    const e2 = await socket.waitFor((f) => f.type === 'event' && f.seq === 2);
    expect(e2).toMatchObject({ seq: 2 });
    // 断线重连：auth 后从 watermark=1 续传（seq2 重发）
    const socket2 = memory.connect();
    socket2.clientSend({ type: 'auth', token: paired.token });
    await socket2.waitFor((f) => f.type === 'ready');
    // 重连 sink watermark=0（新会话对象）→ 应收到缓冲重放 seq1/seq2
    const replayed = await socket2.waitFor((f) => f.type === 'event' && f.seq === 2);
    expect(replayed.seq).toBe(2);
    socket.close();
    socket2.close();
  });

  test('ping → pong', async () => {
    const { memory } = makeDeps();
    const socket = memory.connect();
    socket.clientSend({ type: 'ping' });
    await socket.waitFor((f) => f.type === 'pong');
  });
});
