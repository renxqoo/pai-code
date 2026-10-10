import { describe, expect, it } from '@jest/globals';
import { createRelayTransport, type RelaySocketLike, type RelayCodec } from '../transport';

class MemorySocket implements RelaySocketLike {
  sent: string[] = [];
  private openH: Array<() => void> = [];
  private msgH: Array<(d: string) => void> = [];
  private closeH: Array<() => void> = [];
  private errH: Array<() => void> = [];
  send(d: string): void { this.sent.push(d); }
  close(): void { for (const h of this.closeH) h(); }
  onOpen(cb: () => void): void { this.openH.push(cb); }
  onMessage(cb: (d: string) => void): void { this.msgH.push(cb); }
  onClose(cb: () => void): void { this.closeH.push(cb); }
  onError(cb: () => void): void { this.errH.push(cb); }
  sOpen(): void { for (const h of this.openH) h(); }
  sSend(frame: unknown): void { for (const h of this.msgH) h(JSON.stringify(frame)); }
  sClose(): void { for (const h of this.closeH) h(); }
}

function passthroughCodec(): RelayCodec {
  return {
    seal: (j) => Promise.resolve({ payload: Buffer.from(j).toString('base64'), nonce: Buffer.alloc(17).toString('base64') }),
    open: (p) => Promise.resolve(Buffer.from(p, 'base64').toString('utf8')),
  };
}

function makeTransport(over: { sealGate?: Promise<void> } = {}) {
  let socket = new MemorySocket();
  const statuses: Array<[string, string]> = [];
  const transport = createRelayTransport({
    relayUrl: 'wss://relay.test',
    relayToken: 'tok',
    deviceId: 'd1',
    installationId: 'gw1',
    codec: over.sealGate !== undefined
      ? {
          seal: (j) => over.sealGate?.then(() => ({ payload: Buffer.from(j).toString('base64'), nonce: Buffer.alloc(17).toString('base64') })) ?? Promise.resolve(null),
          open: (p) => Promise.resolve(Buffer.from(p, 'base64').toString('utf8')),
        }
      : passthroughCodec(),
    socketFactory: () => { socket = new MemorySocket(); return socket; },
    callbacks: { onStatus: (s, d) => statuses.push([s, d]), onFrame: () => undefined, onRelayMessage: () => undefined },
  });
  return { transport, statuses, socketOf: () => socket };
}

describe('重连时在途命令不被误判为断连', () => {
  it('dial 期间已 sendCommand 的命令，响应仍被认领（症状：发送失败：连接已断开）', async () => {
    let gateRelease!: () => void;
    const gate = new Promise<void>((r) => { gateRelease = r; });
    const { transport, socketOf } = makeTransport({ sealGate: gate });

    transport.connect();
    socketOf().sOpen();
    expect(transport.connected()).toBe(true);

    // 命令发出（seal 在 await gate —— 复现 seal 落盘 await 窗口）
    const sent = transport.sendCommand({ command: 'prompt', id: 'cmd1' });
    const waiter = transport.waitResponse('cmd1', 3000);

    // 重连换绑：新 transport 再次 connect（复现 connectWithCredentials 重复拨号）
    transport.connect();
    socketOf().sOpen();

    gateRelease();
    expect(await sent).toBe(true);

    // 服务端回投真实响应——必须被认领，而不是 failAllWaiters 抢先 resolve 'disconnected'
    socketOf().sSend({
      v: 1, from: 'gw_gw1', to: 'dev_d1',
      payload: Buffer.from(JSON.stringify({ kind: 'response', streamId: 'cmd:d1', seq: 1, body: { id: 'cmd1', command: 'prompt', success: true, data: { ok: true } } })).toString('base64'),
      nonce: Buffer.alloc(17).toString('base64'),
    });

    const res = await waiter;
    expect(res.error?.code ?? null).not.toBe('disconnected');
    expect(res.success).toBe(true);
    transport.stop();
  });
});
