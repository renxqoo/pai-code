import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import { createWsTransport, type RnSocketLike } from '../ws-client';

/** 内存 socket 对：client 侧 RnSocketLike；server 侧行为模拟器。 */
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

  // server 模拟
  serverOpen(): void {
    for (const handler of this.openHandlers) handler();
  }
  serverSend(frame: unknown): void {
    for (const handler of this.messageHandlers) handler(JSON.stringify(frame));
  }
  serverClose(): void {
    for (const handler of this.closeHandlers) handler();
  }
}

describe('ws-transport', () => {
  let socket: MemorySocket;
  const statuses: string[] = [];
  const events: unknown[] = [];

  const make = (): ReturnType<typeof createWsTransport> =>
    createWsTransport(
      () => {
        socket = new MemorySocket();
        return socket;
      },
      {
        onStatus: (status) => statuses.push(status),
        onEvent: (event) => events.push(event),
        onAuthFailed: () => undefined,
      },
    );

  beforeEach(() => {
    socket = undefined as unknown as MemorySocket;
    statuses.length = 0;
    events.length = 0;
  });

  it('connect → connecting；服务端 open → 无令牌保持（配对面）', () => {
    const transport = make();
    transport.connect('ws://x:1', null);
    expect(transport.status()).toBe('connecting');
    socket.serverOpen();
    expect(statuses).toEqual(['connecting']);
  });

  it('auth → ready；invoke id 关联响应', async () => {
    const transport = make();
    transport.connect('ws://x:1', 'tok');
    socket.serverOpen();
    expect(statuses).toContain('authenticating');
    socket.serverSend({ type: 'ready', serverInfo: { appVersion: '1', hostPhase: 'ready' } });
    expect(transport.status()).toBe('ready');
    const promise = transport.invoke('model/list', {});
    const sentFrame = JSON.parse(socket.sent[socket.sent.length - 1] ?? '{}') as { id?: string };
    expect(sentFrame.id).toBeTruthy();
    socket.serverSend({ type: 'invokeResult', id: sentFrame.id, ok: true, data: [{ provider: 'p' }] });
    const outcome = await promise;
    expect(outcome.ok).toBe(true);
  });

  it('未连接 invoke 拒绝（host_unavailable）', async () => {
    const transport = make();
    const outcome = await transport.invoke('x', {});
    expect(outcome.ok).toBe(false);
  });

  it('事件 seq 确认：收到 event 后回 ack；乱序 seq 丢弃', () => {
    const transport = make();
    transport.connect('ws://x:1', 'tok');
    socket.serverOpen();
    socket.serverSend({ type: 'ready', serverInfo: { appVersion: '1', hostPhase: 'ready' } });
    socket.serverSend({ type: 'event', seq: 1, event: { type: 'turnStarted' } });
    socket.serverSend({ type: 'event', seq: 1, event: { type: 'turnStarted' } }); // 重放
    socket.serverSend({ type: 'event', seq: 2, event: { type: 'turnSettled' } });
    expect(events.length).toBe(2);
    const acks = socket.sent.map((raw) => JSON.parse(raw) as { type?: string; seq?: number }).filter((frame) => frame.type === 'ack');
    expect(acks.map((a) => a.seq)).toEqual([1, 2]);
  });

  it('pair → paired 令牌；pairFailed 透传', async () => {
    const transport = make();
    transport.connect('ws://x:1', null);
    socket.serverOpen();
    const promise = transport.pair('123456', 'iPhone');
    const sentFrame = JSON.parse(socket.sent[socket.sent.length - 1] ?? '{}') as { type?: string };
    expect(sentFrame.type).toBe('pair');
    socket.serverSend({ type: 'paired', token: 'tok1', serverInfo: { appVersion: '1', hostPhase: 'ready' } });
    const result = await promise;
    if (!result.ok) throw new Error(`pair failed: ${result.reason}`);
    expect(result.token).toBe('tok1');
  });

  it('断线：pending invoke 失败 + 重连调度', async () => {
    jest.useFakeTimers();
    try {
      const transport = make();
      transport.connect('ws://x:1', 'tok');
      socket.serverOpen();
      socket.serverSend({ type: 'ready', serverInfo: { appVersion: '1', hostPhase: null } });
      const promise = transport.invoke('x', {});
      socket.serverClose();
      const outcome = await promise;
      expect(outcome.ok).toBe(false);
      expect(statuses).toContain('disconnected');
      // 退避重连（1s 后 dial）
      jest.advanceTimersByTime(1100);
      expect(statuses).toContain('connecting');
    } finally {
      jest.useRealTimers();
    }
  });

  it('authFailed：停止 + 不重连', () => {
    const transport = make();
    transport.connect('ws://x:1', 'bad');
    socket.serverOpen();
    socket.serverSend({ type: 'authFailed', reason: 'unknown_token' });
    expect(transport.status()).toBe('disconnected');
  });
});
