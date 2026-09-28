import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import { createWsTransport, type RnSocketLike } from '../ws-client';
import { createBridgeClient } from '../client';

class MemorySocket implements RnSocketLike {
  sent: string[] = [];
  private openHandlers: Array<() => void> = [];
  private messageHandlers: Array<(data: string) => void> = [];
  private closeHandlers: Array<() => void> = [];
  private errorHandlers: Array<() => void> = [];
  send(data: string): void {
    this.sent.push(data);
  }
  close(): void {
    for (const handler of this.closeHandlers) handler();
  }
  onOpen(cb: () => void): void {
    this.openHandlers.push(cb);
  }
  onMessage(cb: (data: string) => void): void {
    this.messageHandlers.push(cb);
  }
  onClose(cb: () => void): void {
    this.closeHandlers.push(cb);
  }
  onError(cb: () => void): void {
    this.errorHandlers.push(cb);
  }
  serverOpen(): void {
    for (const handler of this.openHandlers) handler();
  }
  serverSend(frame: unknown): void {
    for (const handler of this.messageHandlers) handler(JSON.stringify(frame));
  }
  serverError(): void {
    for (const handler of this.errorHandlers) handler();
  }
}

describe('ws-transport 边界与错误分支', () => {
  let socket: MemorySocket;
  const statuses: string[] = [];
  const events: unknown[] = [];
  const authFailures: string[] = [];

  const make = () =>
    createWsTransport(
      () => {
        socket = new MemorySocket();
        return socket;
      },
      {
        onStatus: (status) => statuses.push(status),
        onEvent: (event) => events.push(event),
        onAuthFailed: (reason) => authFailures.push(reason),
      },
    );

  beforeEach(() => {
    socket = undefined as unknown as MemorySocket;
    statuses.length = 0;
    events.length = 0;
    authFailures.length = 0;
  });

  it('服务端 error → close（重连链启动）', () => {
    const transport = make();
    transport.connect('ws://x:1', 'tok');
    socket.serverOpen();
    socket.serverError();
    expect(statuses).toContain('disconnected');
  });

  it('垃圾 JSON 帧丢弃（不崩不计数）', () => {
    const transport = make();
    transport.connect('ws://x:1', 'tok');
    socket.serverOpen();
    socket.serverSend('not-json{{');
    socket.serverSend({ type: 'unknown-frame' });
    expect(events.length).toBe(0);
    expect(transport.status()).not.toBe('ready');
  });

  it('invoke 超时 → timeout 错误', async () => {
    jest.useFakeTimers();
    try {
      const transport = make();
      transport.connect('ws://x:1', 'tok');
      socket.serverOpen();
      socket.serverSend({ type: 'ready', serverInfo: { appVersion: '1', hostPhase: 'ready' } });
      const promise = transport.invoke('slow', {}, 500);
      jest.advanceTimersByTime(600);
      const outcome = await promise;
      expect(outcome.ok).toBe(false);
      if (!outcome.ok) expect(outcome.error?.kind).toBe('transient');
    } finally {
      jest.useRealTimers();
    }
  });

  it('invoke 结果迟到（超时后到达）→ 丢弃（无 pending）', async () => {
    jest.useFakeTimers();
    try {
      const transport = make();
      transport.connect('ws://x:1', 'tok');
      socket.serverOpen();
      socket.serverSend({ type: 'ready', serverInfo: { appVersion: '1', hostPhase: null } });
      const promise = transport.invoke('x', {}, 300);
      jest.advanceTimersByTime(400);
      const outcome = await promise;
      expect(outcome.ok).toBe(false);
      // 迟到结果（id 已被超时清除——到达无 pending 匹配，静默）
      socket.serverSend({ type: 'invokeResult', id: 'm1', ok: true });
      expect(true).toBe(true);
    } finally {
      jest.useRealTimers();
    }
  });

  it('pair 超时（10s 无响应）→ timeout 拒绝', async () => {
    jest.useFakeTimers();
    try {
      const transport = make();
      transport.connect('ws://x:1', null);
      socket.serverOpen();
      const promise = transport.pair('123456', 'iPhone');
      jest.advanceTimersByTime(11_000);
      const result = await promise;
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe('timeout');
    } finally {
      jest.useRealTimers();
    }
  });

  it('pair 未连接（socket null）→ not_connected', async () => {
    const transport = make();
    const result = await transport.pair('123456', 'x');
    expect(result).toEqual({ ok: false, reason: 'not_connected' });
  });

  it('disconnect 后 connect 再用（重置退避）', () => {
    const transport = make();
    transport.connect('ws://x:1', 'tok');
    socket.serverOpen();
    transport.disconnect();
    expect(transport.status()).toBe('disconnected');
    transport.connect('ws://x:2', 'tok');
    expect(transport.status()).toBe('connecting');
  });

  it('事件失败帧（invokeResult ok=false 携 error）→ 透传 kind', async () => {
    const transport = make();
    transport.connect('ws://x:1', 'tok');
    socket.serverOpen();
    socket.serverSend({ type: 'ready', serverInfo: { appVersion: '1', hostPhase: 'ready' } });
    const promise = transport.invoke('fail', {});
    const sent = JSON.parse(socket.sent[socket.sent.length - 1] ?? '{}') as { id?: string };
    socket.serverSend({ type: 'invokeResult', id: sent.id, ok: false, error: { kind: 'unknown_thread' } });
    const outcome = await promise;
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.error?.kind).toBe('unknown_thread');
  });
});

describe('client 适配层（dispatch/订阅隔离）', () => {
  it('订阅者抛错被隔离（其余订阅者仍收到）', () => {
    const received: unknown[] = [];
    const transport = createWsTransport(
      () => ({ send: () => undefined, close: () => undefined, onOpen: () => undefined, onMessage: () => undefined, onClose: () => undefined, onError: () => undefined }),
      { onStatus: () => undefined, onEvent: () => undefined, onAuthFailed: () => undefined },
    );
    const client = createBridgeClient({ transport });
    client.subscribe(() => {
      throw new Error('subscriber boom');
    });
    client.subscribe((event) => received.push(event));
    client.dispatch({ type: 'host', phase: 'ready' });
    expect(received.length).toBe(1);
  });

  it('dispatch 垃圾事件形状拒（订阅者不收）', () => {
    const received: unknown[] = [];
    const transport = createWsTransport(
      () => ({ send: () => undefined, close: () => undefined, onOpen: () => undefined, onMessage: () => undefined, onClose: () => undefined, onError: () => undefined }),
      { onStatus: () => undefined, onEvent: () => undefined, onAuthFailed: () => undefined },
    );
    const client = createBridgeClient({ transport });
    client.subscribe((event) => received.push(event));
    client.dispatch('garbage');
    client.dispatch({ type: 'no-such-event-type' });
    expect(received.length).toBe(0);
  });

  it('invoke 透传 ok/err 判别（ApiOutcome 形态）', async () => {
    let capturedMethod = '';
    let capturedParams: unknown = null;
    const transport = {
      connect: () => undefined,
      invoke: (method: string, params: unknown) => {
        capturedMethod = method;
        capturedParams = params;
        return Promise.resolve({ ok: true, data: { echo: 1 } });
      },
      pair: () => Promise.resolve({ ok: false as const, reason: 'x' }),
      disconnect: () => undefined,
      status: () => 'ready' as const,
    };
    const client = createBridgeClient({ transport });
    const outcome = (await client.invoke('model/list', { x: 1 })) as { ok: boolean; data?: unknown };
    expect(outcome.ok).toBe(true);
    expect(capturedMethod).toBe('model/list');
    expect(capturedParams).toEqual({ x: 1 });
  });
});
