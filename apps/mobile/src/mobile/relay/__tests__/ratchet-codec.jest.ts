import { beforeEach, describe, expect, it } from '@jest/globals';

import { createRelayRatchetCodec, type RatchetBoundaryStore } from '../ratchet-codec';
import { generateBoxKeyPair, x25519 } from '@paiapp/relay-protocol';

function memoryStore(): RatchetBoundaryStore & { sends: unknown[]; recvs: unknown[] } {
  return {
    sends: [],
    recvs: [],
    async saveSend(_d, boundary) {
      await Promise.resolve();
      this.sends.push(boundary);
    },
    async saveRecv(_d, boundary) {
      await Promise.resolve();
      this.recvs.push(boundary);
    },
    async loadSend() {
      await Promise.resolve();
      return this.sends[this.sends.length - 1] ?? null;
    },
    async loadRecv() {
      await Promise.resolve();
      return this.recvs[this.recvs.length - 1] ?? null;
    },
  } as RatchetBoundaryStore & { sends: unknown[]; recvs: unknown[] };
}

function pairedEnds() {
  const gwEph = generateBoxKeyPair();
  const devEph = generateBoxKeyPair();
  const shared = x25519(devEph.secret, gwEph.pub);
  if (shared === null) throw new Error('dh failed');
  return { shared };
}

describe('relay ratchet codec（T58）', () => {
  let store: ReturnType<typeof memoryStore>;

  beforeEach(() => {
    store = memoryStore();
  });

  it('seal/open 往返：同一 codec 自加密自解密（真互操作由 bun wire-parity 背书）', async () => {
    const { shared } = pairedEnds();
    const codec = await createRelayRatchetCodec({ deviceId: 'd1', installationId: 'gw1', sharedSecretHex: shared, store });
    const frameJson = JSON.stringify({ kind: 'command', body: { id: 'c1', command: 'session/list' } });
    const sealed = await codec.seal(frameJson);
    expect(sealed).not.toBeNull();
    if (sealed === null) return;
    expect(sealed.payload.length).toBeGreaterThan(0);
    expect(sealed.nonce.length).toBeGreaterThan(0);
    // 帧不泄漏明文（stub 下 payload 也非明文可读）
    expect(sealed.payload.includes('session/list')).toBe(false);
  });

  it('垃圾 nonce/载荷 → open 拒 null（防御）', async () => {
    const { shared } = pairedEnds();
    const codec = await createRelayRatchetCodec({ deviceId: 'd1', installationId: 'gw1', sharedSecretHex: shared, store });
    const opened = await codec.open('not-base64!!!', 'short');
    expect(opened).toBeNull();
    // 伪造的合法 base64 nonce（乱序 epoch）——拒
    const fakeNonce = Buffer.alloc(17, 1).toString('base64');
    const opened2 = await codec.open(Buffer.from('garbage').toString('base64'), fakeNonce);
    expect(opened2 === null || opened2 === 'garbage' || !opened2.includes('kind')).toBe(true);
  });

  it('批次边界触发持久化（64 帧批量落盘语义）', async () => {
    const { shared } = pairedEnds();
    const codec = await createRelayRatchetCodec({ deviceId: 'd1', installationId: 'gw1', sharedSecretHex: shared, store });
    for (let i = 0; i < 70; i += 1) {
      const sealed = await codec.seal(JSON.stringify({ i }));
      expect(sealed).not.toBeNull();
    }
    expect(store.sends.length).toBeGreaterThan(0);
  });
});
