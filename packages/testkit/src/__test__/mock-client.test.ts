import { describe, expect, test } from 'bun:test';
import { MockClient } from '../index';
import type { UiEvent } from '@paiapp/contracts';

function ev(n: number): UiEvent {
  return { type: 'chunk', threadId: 't1', text: `m${n}` };
}

describe('MockClient', () => {
  test('invoke 路由到注册的 handler', async () => {
    const c = new MockClient();
    c.handle('thread/prompt', (p) => ({ accepted: true, echo: p }));
    const r = await c.invoke('thread/prompt', { threadId: 't1', message: 'hi' });
    expect(r).toEqual({ accepted: true, echo: { threadId: 't1', message: 'hi' } });
  });

  test('未注册方法 reject（unknown_method）', async () => {
    const c = new MockClient();
    await expect(c.invoke('state/snapshot', {})).rejects.toThrow('unknown_method');
  });

  test('订阅方收到 emit；退订后不再收到', () => {
    const c = new MockClient();
    const got: UiEvent[] = [];
    const off = c.subscribe((e) => got.push(e));
    c.emit(ev(1));
    off();
    c.emit(ev(2));
    expect(got.map((e) => (e as { text: string }).text)).toEqual(['m1']);
    expect(c.eventLog).toHaveLength(2);
  });

  test('晚订阅不重放历史', () => {
    const c = new MockClient();
    c.emit(ev(1));
    const got: UiEvent[] = [];
    c.subscribe((e) => got.push(e));
    c.emit(ev(2));
    expect(got.map((e) => (e as { text: string }).text)).toEqual(['m2']);
  });

  test('capabilities 可注入', () => {
    const c = new MockClient({ fileDialog: false, systemNotification: true });
    expect(c.capabilities.fileDialog).toBe(false);
  });
});

describe('MockClient 订阅语义回归', () => {
  test('同一函数重复订阅：各自退订独立（对齐 preload 传输语义）', () => {
    const c = new MockClient();
    const fn = (e: UiEvent): void => {
      got.push(e);
    };
    const got: UiEvent[] = [];
    const off1 = c.subscribe(fn);
    const off2 = c.subscribe(fn);
    c.emit(ev(1));
    off1();
    c.emit(ev(2));
    off2();
    c.emit(ev(3));
    expect(got).toHaveLength(3);
  });

  test('订阅者抛错被隔离：其他订阅者仍收到，错误记账', () => {
    const c = new MockClient();
    const got: UiEvent[] = [];
    c.subscribe(() => {
      throw new Error('boom');
    });
    c.subscribe((e) => got.push(e));
    c.emit(ev(1));
    expect(got).toHaveLength(1);
    expect(c.subscriberErrors).toHaveLength(1);
  });
});
