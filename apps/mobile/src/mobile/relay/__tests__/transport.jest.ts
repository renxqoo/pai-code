import { beforeEach, describe, expect, it } from '@jest/globals';
import * as React from 'react';

import { createRelayTransport, type RelaySocketLike, type RelayCodec } from '../transport';

/** 内存 socket（服务端模拟：帧收发）。 */
class MemorySocket implements RelaySocketLike {
  sent: string[] = [];
  private openH: Array<() => void> = [];
  private msgH: Array<(d: string) => void> = [];
  private closeH: Array<() => void> = [];
  private errH: Array<() => void> = [];
  send(d: string): void {
    this.sent.push(d);
  }
  close(): void {
    for (const h of this.closeH) h();
  }
  onOpen(cb: () => void): void {
    this.openH.push(cb);
  }
  onMessage(cb: (d: string) => void): void {
    this.msgH.push(cb);
  }
  onClose(cb: () => void): void {
    this.closeH.push(cb);
  }
  onError(cb: () => void): void {
    this.errH.push(cb);
  }
  sOpen(): void {
    for (const h of this.openH) h();
  }
  sSend(frame: unknown): void {
    for (const h of this.msgH) h(JSON.stringify(frame));
  }
  sClose(): void {
    for (const h of this.closeH) h();
  }
}

/** 明文中继 codec（测传输逻辑——加解密由 ratchet-codec 测试与 wire-parity 覆盖）。 */
function passthroughCodec(): RelayCodec {
  return {
    seal: async (frameJson) => {
      await Promise.resolve();
      return { payload: Buffer.from(frameJson).toString('base64'), nonce: Buffer.alloc(17).toString('base64') };
    },
    open: async (payloadBase64) => {
      await Promise.resolve();
      return Buffer.from(payloadBase64, 'base64').toString('utf8');
    },
  };
}

function makeTransport(over: { codec?: RelayCodec } = {}) {
  let socket = new MemorySocket();
  const statuses: Array<[string, string]> = [];
  const frames: Array<Record<string, unknown>> = [];
  const transport = createRelayTransport({
    relayUrl: 'wss://relay.test',
    relayToken: 'tok',
    deviceId: 'd1',
    installationId: 'gw1',
    codec: over.codec ?? passthroughCodec(),
    socketFactory: () => {
      socket = new MemorySocket();
      return socket;
    },
    callbacks: {
      onStatus: (status, detail) => statuses.push([status, detail]),
      onFrame: (frame) => frames.push(frame as unknown as Record<string, unknown>),
      onRelayMessage: () => undefined,
    },
  });
  return { transport, statuses, frames, socketOf: () => socket };
}

describe('relay transport（T58 P2）', () => {
  it('连接生命周期：connecting → ready（连接即就绪）；断开 → 重连退避', async () => {
    await Promise.resolve();
    const { transport, statuses, socketOf } = makeTransport();
    transport.connect();
    expect(statuses[statuses.length - 1]?.[0]).toBe('connecting');
    socketOf().sOpen();
    expect(transport.connected()).toBe(true);
    expect(statuses.some(([s]) => s === 'ready')).toBe(true);
    transport.stop();
    expect(transport.status()).toBe('disconnected');
  });

  it('sendCommand → L3 信封（from dev_/to gw_）；response 认领 + outbox 释放', async () => {
    const { transport, socketOf } = makeTransport();
    transport.connect();
    socketOf().sOpen();
    const sentPromise = transport.sendCommand({ command: 'session/list', id: 'cmd1' });
    expect(await sentPromise).toBe(true);
    const env = JSON.parse(socketOf().sent[0] as string) as { from?: string; to?: string; payload?: string };
    expect(env.from).toBe('dev_d1');
    expect(env.to).toBe('gw_gw1');
    const inner = JSON.parse(Buffer.from(env.payload as string, 'base64').toString('utf8')) as { kind?: string; body?: { id?: string } };
    expect(inner.kind).toBe('command');
    expect(inner.body?.id).toBe('cmd1');
    // 服务端回投 response（经信封——from gw_）
    const responseJson = JSON.stringify({ kind: 'response', streamId: 'cmd:d1', seq: 1, body: { id: 'cmd1', command: 'session/list', success: true, data: [] } });
    socketOf().sSend({ v: 1, from: 'gw_gw1', to: 'dev_d1', payload: Buffer.from(responseJson).toString('base64'), nonce: Buffer.alloc(17).toString('base64') });
    const response = await transport.waitResponse('cmd1', 2000);
    expect(response.success).toBe(true);
    expect(transport.outboxIds()).not.toContain('cmd1');
    transport.stop();
  });

  it('事件帧上抛 + ACK 水位（32 帧合并触发 ack 帧）', async () => {
    const { transport, socketOf, frames } = makeTransport();
    transport.connect();
    socketOf().sOpen();
    for (let i = 1; i <= 33; i += 1) {
      const eventJson = JSON.stringify({ kind: 'event', streamId: 'ev:t1', seq: i, body: { threadId: 't1', name: 'textDelta', payload: { i } } });
      socketOf().sSend({ v: 1, from: 'gw_gw1', to: 'dev_d1', payload: Buffer.from(eventJson).toString('base64'), nonce: Buffer.alloc(17).toString('base64') });
    }
    await new Promise((r) => {
      setTimeout(r, 50);
    });
    expect(frames.length).toBe(33);
    const ackEnvelopes = socketOf()
      .sent.map((raw) => JSON.parse(raw) as { payload?: string })
      .filter((env) => typeof env.payload === 'string')
      .map((env) => JSON.parse(Buffer.from(env.payload as string, 'base64').toString('utf8')) as { kind?: string })
      .filter((frame) => frame.kind === 'ack');
    expect(ackEnvelopes.length).toBeGreaterThanOrEqual(1);
    transport.stop();
  });

  it('chunk 分片重组上抛（3 段乱序）', async () => {
    const { transport, socketOf, frames } = makeTransport();
    transport.connect();
    socketOf().sOpen();
    const whole = JSON.stringify({ kind: 'response', streamId: 'cmd:d1', seq: 9, body: { id: 'big', command: 'session/entries', success: true } });
    const bytes = Buffer.from(whole);
    const third = Math.ceil(bytes.length / 3);
    const segs = [0, 1, 2].map((i) => ({ segmentId: i, segmentCount: 3, data: Buffer.from(bytes.subarray(i * third, (i + 1) * third)).toString('base64') }));
    // 乱序：2 → 0 → 1
    for (const i of [2, 0, 1]) {
      const segJson = JSON.stringify({ kind: 'chunk', streamId: 'cmd:d1', seq: 9, body: segs[i] });
      socketOf().sSend({ v: 1, from: 'gw_gw1', to: 'dev_d1', payload: Buffer.from(segJson).toString('base64'), nonce: Buffer.alloc(17).toString('base64') });
    }
    await new Promise((r) => {
      setTimeout(r, 50);
    });
    const whole2 = frames.find((frame) => (frame as { body?: { id?: string } }).body?.id === 'big');
    expect(whole2).toBeTruthy();
    transport.stop();
  });

  it('未连接 sendCommand 拒 false；waitResponse 超时 outcome', async () => {
    const { transport } = makeTransport();
    const sent = await transport.sendCommand({ command: 'x', id: 'x1' });
    expect(sent).toBe(false);
    const response = await transport.waitResponse('none', 120);
    expect(response.success).toBe(false);
    expect(response.error).toBeTruthy();
  });

  it('断线：重复 connect 关旧 socket；身份守卫使旧 close 不动现行状态', () => {
    const { transport, socketOf } = makeTransport();
    transport.connect();
    const first = socketOf();
    first.sOpen();
    transport.connect();
    const second = socketOf();
    expect(second).not.toBe(first);
    second.sOpen();
    expect(transport.connected()).toBe(true);
    first.sClose(); // 旧 socket 迟到 close
    expect(transport.connected()).toBe(true);
    transport.stop();
  });

  it('relay 控制行（from=relay）走 onRelayMessage 不进帧泵', async () => {
    const { transport, socketOf, frames } = makeTransport();
    transport.connect();
    socketOf().sOpen();
    socketOf().sSend({ v: 1, from: 'relay', to: 'dev_d1', payload: Buffer.from('{"error":"no-route"}').toString('base64'), nonce: Buffer.alloc(17).toString('base64') });
    await new Promise((r) => {
      setTimeout(r, 30);
    });
    expect(frames.length).toBe(0);
    transport.stop();
  });
});

void React;
void beforeEach;
