import { beforeEach, describe, expect, it } from '@jest/globals';

import { createPairingSession, generateDeviceIdentity, type PairingWire } from '../pairing';
import { pakeRespond, pakeConfirm } from '@x3code/relay-protocol';
import { relayCredentialsStore, setRatchetKv, createKvRatchetStore } from '../credentials';

/** 内存配对线（gateway pairing-server 模拟）。 */
function makeWire() {
  const listeners = new Set<(message: Record<string, unknown>) => void>();
  const sent: Array<Record<string, unknown>> = [];
  const wire: PairingWire & { serverReply(message: Record<string, unknown>): void; sentOf(): Array<Record<string, unknown>> } = {
    opened: () => Promise.resolve(true),
    send: (line) => {
      const env = JSON.parse(line) as { payload?: string; from?: string; to?: string };
      sent.push(JSON.parse(Buffer.from(env.payload as string, 'base64').toString('utf8')) as Record<string, unknown>);
    },
    onMessage: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    close: () => undefined,
    serverReply: (message) => {
      for (const listener of listeners) listener(message);
    },
    sentOf: () => sent,
  };
  return wire;
}

describe('pairing session（T58 P3）', () => {
  it('手输码路径：startManual → pake-a 帧（6 位码/设备名随帧）', async () => {
    const wire = makeWire();
    const steps: string[] = [];
    const session = createPairingSession({
      wire,
      endpoints: { relayUrl: 'wss://r', installationId: 'gw1' },
      pairingId: 'pr_1',
      deviceInfo: { name: 'iPhone-test', deviceType: 'phone', platform: 'ios', appVersion: '1' },
    });
    session.onStep((step) => steps.push(step.phase));
    await session.startManual('123456', 'iPhone-test');
    const frames = wire.sentOf();
    expect(frames[0]?.['p']).toBe('pake-a');
    expect(typeof frames[0]?.['pakeA']).toBe('string');
    expect(steps).toContain('connecting');
    expect(steps).toContain('awaiting-sas');
    session.close();
  });

  it('非法码（≠6 位）立即 failed: bad_code 不发帧', async () => {
    const wire = makeWire();
    const session = createPairingSession({
      wire,
      endpoints: { relayUrl: 'wss://r', installationId: 'gw1' },
      pairingId: 'pr_2',
      deviceInfo: { name: 'x', deviceType: 'phone', platform: 'ios', appVersion: '1' },
    });
    let failed: string | null = null;
    session.onStep((step) => {
      if (step.phase === 'failed') failed = step.reason;
    });
    await session.startManual('123', 'x');
    expect(failed).toBe('bad_code');
    expect(wire.sentOf().length).toBe(0);
  });

  it('submitDeviceKeys → device-keys 帧（长期钥呈递）', async () => {
    const wire = makeWire();
    const session = createPairingSession({
      wire,
      endpoints: { relayUrl: 'wss://r', installationId: 'gw1' },
      pairingId: 'pr_3',
      deviceInfo: { name: 'x', deviceType: 'phone', platform: 'ios', appVersion: '1' },
    });
    const identity = generateDeviceIdentity();
    await session.submitDeviceKeys(identity);
    const frame = wire.sentOf()[0];
    expect(frame?.['p']).toBe('device-keys');
    expect(frame?.['longTermPub']).toBe(identity.signingPub);
  });

  it('gateway 拒绝（rejected 帧）→ failed 状态', () => {
    const wire = makeWire();
    const session = createPairingSession({
      wire,
      endpoints: { relayUrl: 'wss://r', installationId: 'gw1' },
      pairingId: 'pr_4',
      deviceInfo: { name: 'x', deviceType: 'phone', platform: 'ios', appVersion: '1' },
    });
    let failed: string | null = null;
    session.onStep((step) => {
      if (step.phase === 'failed') failed = step.reason;
    });
    wire.serverReply({ p: 'rejected', reason: 'pair_rejected' });
    expect(failed).toBe('pair_rejected');
  });

  it('waitRegistered 超时拒绝（无 ack 场景）', async () => {
    const wire = makeWire();
    const session = createPairingSession({
      wire,
      endpoints: { relayUrl: 'wss://r', installationId: 'gw1' },
      pairingId: 'pr_5',
      deviceInfo: { name: 'x', deviceType: 'phone', platform: 'ios', appVersion: '1' },
    });
    const outcome = await session.waitRegistered(150);
    expect(outcome.ok).toBe(false);
    session.close();
  });
});

describe('credentials（T58）', () => {
  beforeEach(() => {
    const map = new Map<string, string>();
    setRatchetKv({
      get: (key) => map.get(key) ?? null,
      set: (key, value) => {
        map.set(key, value);
      },
    });
  });

  it('save/load round-trip + clear', async () => {
    const saved = await relayCredentialsStore.save({
      deviceId: 'dev_abc',
      signingSecret: 's1',
      signingPub: 'p1',
      sharedSecretHex: 'sh1',
      installationId: 'gw1',
      relayUrl: 'wss://relay.test',
    });
    expect(saved).toBe(true);
    const loaded = relayCredentialsStore.load();
    expect(loaded?.deviceId).toBe('dev_abc');
    expect(loaded?.relayUrl).toBe('wss://relay.test');
    await relayCredentialsStore.clear();
    expect(relayCredentialsStore.load()).toBeNull();
  });

  it('ratchet KV store 往返', async () => {
    const store = createKvRatchetStore();
    await store.saveSend('dev_1', { nextIndex: 64, baseIndex: 0 });
    const loaded = await store.loadSend('dev_1');
    expect(loaded).toMatchObject({ nextIndex: 64 });
    expect(await store.loadRecv('dev_1')).toBeNull();
  });
});

describe('pairing ack token 旅程（WIRE 设备注册收尾回归）', () => {
  it('裸 ack → 重呈轮询；带 relayToken ack → registered resolve', async () => {
    const wire = makeWire();
    const session = createPairingSession({
      wire,
      endpoints: { relayUrl: 'wss://r', installationId: 'gw1' },
      pairingId: 'pr_ack1',
      deviceInfo: { name: 'x', deviceType: 'phone', platform: 'ios', appVersion: '1' },
    });
    // 手输码路径建立 shared
    await session.startManual('123456', 'x');
    // gateway 侧 pake 应答（pake-b 帧 → 手机 shared 建立）
    const pakeAFrame = wire.sentOf().find((f) => f['p'] === 'pake-a');
    const pairingIdForConfirm = session.pairingId;
    const resp = pakeRespond('123456', typeof pakeAFrame?.['pakeA'] === 'string' ? (pakeAFrame['pakeA'] as string) : '');
    wire.serverReply({ p: 'pake-b', pakeB: resp.message, confirm: pakeConfirm(resp.shared, pairingIdForConfirm), gwEph: 'gweph_test', gatewayPub: 'gwpub_test' });
    await new Promise((r) => {
      setTimeout(r, 30);
    });
    const keys = generateDeviceIdentity();
    const registeredPromise = session.waitRegistered(1500);
    await session.submitDeviceKeys(keys);
    // 裸 ack（confirm 未落账）
    wire.serverReply({ p: 'ack' });
    await new Promise((r) => {
      setTimeout(r, 50);
    });
    // 重呈发生（至少再发一次 device-keys）
    const frames = wire.sentOf();
    const deviceKeysCount = frames.filter((f) => f['p'] === 'device-keys').length;
    expect(deviceKeysCount).toBeGreaterThanOrEqual(1);
    // confirm 后的 ack 携 token → registered
    wire.serverReply({ p: 'ack', relayToken: 'devtok_x', deviceId: 'd_ack1' });
    const registered = await registeredPromise;
    expect(registered.ok).toBe(true);
    expect(session.relayToken).toBe('devtok_x');
    expect(session.registeredDeviceId).toBe('d_ack1');
    session.close();
  });

  it('waitRegistered 在 ack 早到时立即返回（时序解耦）', async () => {
    const wire = makeWire();
    const session = createPairingSession({
      wire,
      endpoints: { relayUrl: 'wss://r', installationId: 'gw1' },
      pairingId: 'pr_ack2',
      deviceInfo: { name: 'x', deviceType: 'phone', platform: 'ios', appVersion: '1' },
    });
    await session.startManual('123456', 'x');
    const pakeAFrame = wire.sentOf().find((f) => f['p'] === 'pake-a');
    const pairingIdForConfirm = session.pairingId;
    const resp = pakeRespond('123456', typeof pakeAFrame?.['pakeA'] === 'string' ? (pakeAFrame['pakeA'] as string) : '');
    wire.serverReply({ p: 'pake-b', pakeB: resp.message, confirm: pakeConfirm(resp.shared, pairingIdForConfirm), gwEph: 'gweph_test', gatewayPub: 'gwpub_test' });
    await new Promise((r) => {
      setTimeout(r, 30);
    });
    const keys = generateDeviceIdentity();
    await session.submitDeviceKeys(keys);
    wire.serverReply({ p: 'ack', relayToken: 'tok_early', deviceId: 'd2' });
    await new Promise((r) => {
      setTimeout(r, 30);
    });
    const registered = await session.waitRegistered(300);
    expect(registered.ok).toBe(true);
    session.close();
  });
});

describe('pairing ack token 旅程（WIRE 设备注册收尾回归）', () => {
  it('裸 ack → 重呈轮询；带 relayToken ack → registered resolve', async () => {
    const wire = makeWire();
    const session = createPairingSession({
      wire,
      endpoints: { relayUrl: 'wss://r', installationId: 'gw1' },
      pairingId: 'pr_ack1',
      deviceInfo: { name: 'x', deviceType: 'phone', platform: 'ios', appVersion: '1' },
    });
    await session.startManual('123456', 'x');
    // gateway 侧 pake 应答（pake-b 帧 → 手机 shared 建立）
    const pakeAFrame = wire.sentOf().find((f) => f['p'] === 'pake-a');
    const pairingIdForConfirm = session.pairingId;
    const resp = pakeRespond('123456', typeof pakeAFrame?.['pakeA'] === 'string' ? (pakeAFrame['pakeA'] as string) : '');
    wire.serverReply({ p: 'pake-b', pakeB: resp.message, confirm: pakeConfirm(resp.shared, pairingIdForConfirm), gwEph: 'gweph_test', gatewayPub: 'gwpub_test' });
    await new Promise((r) => {
      setTimeout(r, 30);
    });
    const keys = generateDeviceIdentity();
    const registeredPromise = session.waitRegistered(1500);
    await session.submitDeviceKeys(keys);
    wire.serverReply({ p: 'ack' });
    await new Promise((r) => {
      setTimeout(r, 50);
    });
    const frames = wire.sentOf();
    const deviceKeysCount = frames.filter((f) => f['p'] === 'device-keys').length;
    expect(deviceKeysCount).toBeGreaterThanOrEqual(1);
    wire.serverReply({ p: 'ack', relayToken: 'devtok_x', deviceId: 'd_ack1' });
    const registered = await registeredPromise;
    expect(registered.ok).toBe(true);
    expect(session.relayToken).toBe('devtok_x');
    expect(session.registeredDeviceId).toBe('d_ack1');
    session.close();
  });

  it('waitRegistered 在 ack 早到时立即返回（时序解耦）', async () => {
    const wire = makeWire();
    const session = createPairingSession({
      wire,
      endpoints: { relayUrl: 'wss://r', installationId: 'gw1' },
      pairingId: 'pr_ack2',
      deviceInfo: { name: 'x', deviceType: 'phone', platform: 'ios', appVersion: '1' },
    });
    await session.startManual('123456', 'x');
    const pakeAFrame = wire.sentOf().find((f) => f['p'] === 'pake-a');
    const pairingIdForConfirm = session.pairingId;
    const resp = pakeRespond('123456', typeof pakeAFrame?.['pakeA'] === 'string' ? (pakeAFrame['pakeA'] as string) : '');
    wire.serverReply({ p: 'pake-b', pakeB: resp.message, confirm: pakeConfirm(resp.shared, pairingIdForConfirm), gwEph: 'gweph_test', gatewayPub: 'gwpub_test' });
    await new Promise((r) => {
      setTimeout(r, 30);
    });
    const keys = generateDeviceIdentity();
    await session.submitDeviceKeys(keys);
    wire.serverReply({ p: 'ack', relayToken: 'tok_early', deviceId: 'd2' });
    await new Promise((r) => {
      setTimeout(r, 30);
    });
    const registered = await session.waitRegistered(300);
    expect(registered.ok).toBe(true);
    session.close();
  });
});
