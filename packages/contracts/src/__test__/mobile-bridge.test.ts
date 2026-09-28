import { describe, expect, test } from 'bun:test';

import {
  BridgeAckFrameSchema,
  BridgeClientFrameSchema,
  BridgeEventFrameSchema,
  BridgeInvokeFrameSchema,
  BridgeInvokeResultFrameSchema,
  BridgePairFrameSchema,
  BridgePairedFrameSchema,
  BridgeServerFrameSchema,
} from '../mobile-bridge';

describe('bridge 上行帧', () => {
  test('pair 合法形状', () => {
    expect(BridgePairFrameSchema.parse({ type: 'pair', code: '123456', deviceName: 'iPhone' })).toEqual({
      type: 'pair',
      code: '123456',
      deviceName: 'iPhone',
    });
  });
  test('pair 码非 6 位拒', () => {
    expect(BridgePairFrameSchema.safeParse({ type: 'pair', code: '12345', deviceName: 'x' }).success).toBe(false);
    expect(BridgePairFrameSchema.safeParse({ type: 'pair', code: 'abcdef', deviceName: 'x' }).success).toBe(false);
  });
  test('invoke 携带任意 params（路由侧二次校验）', () => {
    const frame = BridgeInvokeFrameSchema.parse({ type: 'invoke', id: 'c1', method: 'session/prompt', params: { threadId: 't' } });
    expect(frame.id).toBe('c1');
    expect(() => BridgeInvokeFrameSchema.parse({ type: 'invoke', id: '', method: 'x', params: {} })).toThrow();
  });
  test('ack seq 非负整数', () => {
    expect(BridgeAckFrameSchema.safeParse({ type: 'ack', seq: 0 }).success).toBe(true);
    expect(BridgeAckFrameSchema.safeParse({ type: 'ack', seq: -1 }).success).toBe(false);
    expect(BridgeAckFrameSchema.safeParse({ type: 'ack', seq: 1.5 }).success).toBe(false);
  });
  test('客户端帧判别联合：未知 type 拒', () => {
    expect(BridgeClientFrameSchema.safeParse({ type: 'nope' }).success).toBe(false);
    expect(BridgeClientFrameSchema.safeParse('string').success).toBe(false);
    expect(BridgeClientFrameSchema.safeParse(null).success).toBe(false);
  });
});

describe('bridge 下行帧', () => {
  test('paired 携带令牌与 serverInfo', () => {
    const frame = BridgePairedFrameSchema.parse({
      type: 'paired',
      token: 'tok_abc',
      serverInfo: { appVersion: '1.0.0', hostPhase: 'ready' },
    });
    expect(frame.serverInfo.hostPhase).toBe('ready');
  });
  test('invokeResult 成功/失败两形态', () => {
    expect(BridgeInvokeResultFrameSchema.parse({ type: 'invokeResult', id: 'c1', ok: true, data: {} }).ok).toBe(true);
    const failed = BridgeInvokeResultFrameSchema.parse({
      type: 'invokeResult',
      id: 'c1',
      ok: false,
      error: { kind: 'transient', face: 'host_unavailable' },
    });
    expect(failed.error?.kind).toBe('transient');
    // 新错误种类（kind 开集）不被丢弃
    const future = BridgeInvokeResultFrameSchema.parse({ type: 'invokeResult', id: 'c1', ok: false, error: { kind: 'brand_new', x: 1 } });
    expect((future.error as { kind: string }).kind).toBe('brand_new');
  });
  test('event 携带未知事件形状（透传——映射在客户端做）', () => {
    const frame = BridgeEventFrameSchema.parse({ type: 'event', seq: 7, event: { type: 'textDelta', delta: 'x' } });
    expect(frame.seq).toBe(7);
  });
  test('服务端帧判别联合', () => {
    expect(BridgeServerFrameSchema.safeParse({ type: 'pong' }).success).toBe(true);
    expect(BridgeServerFrameSchema.safeParse({ type: 'event', seq: -1, event: {} }).success).toBe(false);
  });
});
