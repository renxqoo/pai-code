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
} from '@x3code/relay-protocol';

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

export async function createRelayRatchetCodec(deps: RelayRatchetCodecDeps): Promise<RelayCodecFace> {
  const persist = {
    persistSendBoundary: (deviceId: string, boundary: unknown) => deps.store.saveSend(deviceId, boundary),
    persistRecvBoundary: (deviceId: string, boundary: unknown) => deps.store.saveRecv(deviceId, boundary),
  };
  const sessionDeps = { now: Date.now, deviceId: deps.deviceId, direction: 1 as const, persist };
  // 恢复优先（H5：重启/重连后 nonce 永不复现——同种子重铸链 = GCM nonce/key 复用）；
  // 持久化组撕裂（epoch 不一致）时弃档重建并推进（fail-open 到重配对语义）
  let ratchet: RatchetSession;
  const [savedSend, savedRecv] = await Promise.all([deps.store.loadSend(deps.deviceId), deps.store.loadRecv(deps.deviceId)]);
  const sendBoundary = savedSend as { rootKey?: string; sendChainKey?: string; nextIndex?: number; epoch?: number; baseIndex?: number } | null;
  const recvBoundary = savedRecv as { recvChainKey?: string; nextIndex?: number; lastRecvIndex?: number; epoch?: number } | null;
  if (
    sendBoundary !== null && recvBoundary !== null &&
    typeof sendBoundary.rootKey === 'string' && typeof sendBoundary.sendChainKey === 'string' &&
    typeof sendBoundary.nextIndex === 'number' && typeof sendBoundary.epoch === 'number' &&
    typeof recvBoundary.recvChainKey === 'string' && typeof recvBoundary.nextIndex === 'number' &&
    typeof recvBoundary.lastRecvIndex === 'number' && typeof recvBoundary.epoch === 'number' &&
    sendBoundary.epoch === recvBoundary.epoch
  ) {
    ratchet = RatchetSession.restore(
      sessionDeps,
      { rootKey: sendBoundary.rootKey, sendChainKey: sendBoundary.sendChainKey, nextIndex: sendBoundary.nextIndex, epoch: sendBoundary.epoch, ...(typeof sendBoundary.baseIndex === 'number' ? { baseIndex: sendBoundary.baseIndex } : {}) },
      { recvChainKey: recvBoundary.recvChainKey, nextIndex: recvBoundary.nextIndex, lastRecvIndex: recvBoundary.lastRecvIndex, epoch: recvBoundary.epoch },
    );
  } else {
    ratchet = new RatchetSession(sessionDeps, deriveInitialChains(deps.sharedSecretHex, false));
  }
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
