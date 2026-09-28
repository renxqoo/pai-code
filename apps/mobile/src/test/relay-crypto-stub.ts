/**
 * jest 专用 crypto 替身（非安全实现——仅测协议逻辑）：seal/open 可逆。
 * 真加密等价性由 packages/relay-protocol bun 测试（wire-parity 12 例 RFC 向量对拍）
 * 背书；RN 生产路径用真 noble 实现。随机性用 Math.random（测试确定性无关）。
 */
export const CRYPTO_SUITE = 'stub-for-jest';

export interface KeyPairHex {
  secret: string;
  pub: string;
}

export function randomBytes(length: number): Uint8Array {
  const out = new Uint8Array(length);
  for (let i = 0; i < length; i += 1) out[i] = Math.floor(Math.random() * 256);
  return out;
}

export function randomInt(maxExclusive: number): number {
  return Math.floor(Math.random() * maxExclusive);
}

export function x25519PublicFromSecret(secretHex: string): string {
  return `pub-${secretHex.slice(0, 16)}`;
}

export function generateBoxKeyPair(): KeyPairHex {
  const secret = Array.from(randomBytes(16)).map((b) => b.toString(16).padStart(2, '0')).join('');
  return { secret, pub: x25519PublicFromSecret(secret) };
}

export function x25519(secretHex: string, peerPublicHex: string): string | null {
  return `shared-${secretHex.slice(0, 8)}-${peerPublicHex.slice(4, 12)}`;
}

export function fromSecretSigning(seedHex: string): KeyPairHex {
  return { secret: seedHex, pub: `spk-${seedHex.slice(0, 12)}` };
}

export function generateSigningKeyPair(): KeyPairHex {
  const secret = Array.from(randomBytes(16)).map((b) => b.toString(16).padStart(2, '0')).join('');
  return fromSecretSigning(secret);
}

export function signBytes(secretHex: string, message: Uint8Array): string {
  return `sig-${secretHex.slice(0, 6)}-${Array.from(message.slice(0, 6)).join('.')}`;
}

export function verifyBytes(publicHex: string, message: Uint8Array, signatureHex: string): boolean {
  return signatureHex === `sig-${publicHex.slice(4, 10)}-${Array.from(message.slice(0, 6)).join('.')}`;
}

export function aeadSeal(spec: { key: Uint8Array; nonce: Uint8Array; plaintext: Uint8Array; aad: Uint8Array }): Uint8Array {
  void spec.aad;
  void spec.key;
  const nonceMark = new Uint8Array(spec.nonce.length + spec.plaintext.length);
  nonceMark.set(spec.nonce, 0);
  nonceMark.set(spec.plaintext, spec.nonce.length);
  return nonceMark;
}

export function aeadOpen(spec: { key: Uint8Array; nonce: Uint8Array; ciphertext: Uint8Array; aad: Uint8Array }): Uint8Array | null {
  void spec.key;
  void spec.aad;
  const nonceLength = spec.nonce.length;
  if (spec.ciphertext.length < nonceLength) return null;
  return spec.ciphertext.slice(nonceLength);
}

export function hkdf(spec: { ikm: Uint8Array | string; salt: Uint8Array; info: string; length: number }): Uint8Array {
  const ikm = typeof spec.ikm === 'string' ? new TextEncoder().encode(spec.ikm) : spec.ikm;
  const mixed = new Uint8Array(ikm.length + spec.salt.length + spec.info.length);
  mixed.set(ikm, 0);
  mixed.set(spec.salt, ikm.length);
  mixed.set(new TextEncoder().encode(spec.info), ikm.length + spec.salt.length);
  // 确定性压缩到 length（重复折叠——测试可复现）
  const out = new Uint8Array(spec.length);
  for (let i = 0; i < spec.length; i += 1) out[i] = mixed[i % mixed.length] ?? 1;
  return out;
}

export function hmacSha256(key: Uint8Array, message: Uint8Array): Uint8Array {
  const out = new Uint8Array(32);
  for (let i = 0; i < 32; i += 1) out[i] = (key[i % key.length] ?? 0) ^ (message[i % message.length] ?? 0);
  return out;
}

export const HKDF_INFO = {
  pairingChannel: 'xh-remote/pairing-channel/v1',
  ratchetRoot: 'xh-remote/ratchet-root/v1',
  messageKey: 'xh-remote/message-key/v1',
  rekeyRoot: 'xh-remote/rekey-root/v1',
  sas: 'xh-remote/sas/v1',
  relayToken: 'xh-remote/relay-token/v1',
  pake: 'xh-remote/pake/v1',
} as const;

export function buildNonce(epoch: number, direction: 0 | 1, index: number): Uint8Array {
  const nonce = new Uint8Array(17);
  const dv = new DataView(nonce.buffer, nonce.byteOffset, nonce.byteLength);
  dv.setBigUint64(0, BigInt(epoch), false);
  nonce[8] = direction;
  dv.setBigUint64(9, BigInt(index), false);
  return nonce;
}

export function parseNonce(nonce: Uint8Array): { epoch: number; index: number; direction: number } | null {
  if (nonce.length !== 17) return null;
  const dv = new DataView(nonce.buffer, nonce.byteOffset, nonce.byteLength);
  return { epoch: Number(dv.getBigUint64(0, false)), index: Number(dv.getBigUint64(9, false)), direction: nonce[8] ?? 0 };
}

export function buildAad(from: string, to: string, epoch: number): Uint8Array {
  return new TextEncoder().encode(`v1|${from}|${to}|${epoch}`);
}

export function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i += 1) out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export function bytesToHex(bytes: Uint8Array): string {
  let out = '';
  for (const b of bytes) out += b.toString(16).padStart(2, '0');
  return out;
}
