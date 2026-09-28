/**
 * 设备侧 ratchet codec（T58）：配对产物种子 + RatchetSession + 注入式持久化。
 * 对照 x-harness remote-client/ratchet-store——差异：persist 非空桩（MMKV/内存
 * 由装配注入——批首落盘成功才放行发送是 ratchet 语义，空桩 = 崩溃恢复 nonce 复用）。
 */
import {
  RatchetSession,
  buildAad,
  deriveInitialChains,
  parseNonce,
  aeadSeal,
} from '@paiapp/relay-protocol';

export interface RatchetBoundaryStore {
  /** 发送边界落盘（返回 reject = seal 拒发——fail-closed）。 */
  saveSend(deviceId: string, boundary: unknown): Promise<void>;
  saveRecv(deviceId: string, boundary: unknown): Promise<void>;
  loadSend(deviceId: string): Promise<unknown>;
  loadRecv(deviceId: string): Promise<unknown>;
}

export interface RelayRatchetCodecDeps {
  deviceId: string;
  installationId: string;
  /** 配对产物：X25519 共享密钥（hex）。 */
  sharedSecretHex: string;
  store: RatchetBoundaryStore;
}

export interface RelayCodecFace {
  seal(frameJson: string): Promise<{ payload: string; nonce: string } | null>;
  open(payloadBase64: string, nonceBase64: string): Promise<string | null>;
}

export function createRelayRatchetCodec(deps: RelayRatchetCodecDeps): RelayCodecFace {
  const ratchet = new RatchetSession(
    {
      now: Date.now,
      deviceId: deps.deviceId,
      direction: 1,
      persist: {
        persistSendBoundary: (deviceId: string, boundary: unknown) => deps.store.saveSend(deviceId, boundary),
        persistRecvBoundary: (deviceId: string, boundary: unknown) => deps.store.saveRecv(deviceId, boundary),
      },
    },
    deriveInitialChains(deps.sharedSecretHex, false),
  );
  let openChain: Promise<void> = Promise.resolve();

  return {
    async seal(frameJson) {
      const outcome = await ratchet.seal({ plaintext: new TextEncoder().encode(frameJson), aadFrom: `dev_${deps.deviceId}`, aadTo: `gw_${deps.installationId}` });
      if (!outcome.ok) return null;
      const ct = aeadSeal({ key: new Uint8Array(Buffer.from(outcome.keyUsed, 'hex')), nonce: outcome.nonce, plaintext: new TextEncoder().encode(frameJson), aad: outcome.aad });
      return { payload: Buffer.from(ct).toString('base64'), nonce: Buffer.from(outcome.nonce).toString('base64') };
    },
    open(payloadBase64, nonceBase64) {
      const run = openChain.then(async () => {
        const ct = new Uint8Array(Buffer.from(payloadBase64, 'base64'));
        const nonceBytes = new Uint8Array(Buffer.from(nonceBase64, 'base64'));
        const parsed = parseNonce(nonceBytes);
        if (parsed === null) return null;
        const aad = buildAad(`gw_${deps.installationId}`, `dev_${deps.deviceId}`, parsed.epoch);
        const outcome = await ratchet.open({ ciphertext: ct, nonce: nonceBytes, aad, index: parsed.index, epoch: parsed.epoch });
        if (!outcome.ok) return null;
        return Buffer.from(outcome.plaintext).toString('utf8');
      });
      openChain = run.then(
        () => undefined,
        () => undefined,
      );
      return run;
    },
  };
}
