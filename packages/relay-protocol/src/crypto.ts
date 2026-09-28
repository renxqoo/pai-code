/**
 * L1 加密原语（T58 fork 自 x-harness remote-protocol/crypto.ts）。
 * 对外签名与线格式零变化（hex 进出）；内部实现 @noble 纯 JS——React Native
 * Hermes 无 node:crypto（X25519 KeyObject/DER、AES-GCM、Ed25519、同步 HKDF 全缺）。
 * 等价性由 __test__/wire-parity.test.ts 用 RFC 7748/8032/5869/NIST-GCM 固定向量
 * 与 x-harness 原实现对拍钉死。
 */
import { x25519 as x25519curve, ed25519 } from '@noble/curves/ed25519.js';
import { gcm } from '@noble/ciphers/aes.js';
import { hkdf as nobleHkdf } from '@noble/hashes/hkdf.js';
import { hmac as nobleHmac } from '@noble/hashes/hmac.js';
import { sha256 } from '@noble/hashes/sha2.js';

export const CRYPTO_SUITE = 'x25519-ed25519-aes256gcm-hkdf-sha256-v1';

export interface KeyPairHex {
  secret: string;
  pub: string;
}

const hexToBytes = (hex: string): Uint8Array => {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i += 1) {
    out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
};

const bytesToHex = (bytes: Uint8Array): string => {
  let out = '';
  for (const b of bytes) out += b.toString(16).padStart(2, '0');
  return out;
};

/** CSPRNG（noble randomBytes → crypto.getRandomValues；RN 侧需 polyfill）。 */
export function randomBytes(length: number): Uint8Array {
  const out = new Uint8Array(length);
  globalThis.crypto.getRandomValues(out);
  return out;
}

/** 拒绝采样随机整数 [0, max)（配对码数位——等分布无取模偏差）。 */
export function randomInt(maxExclusive: number): number {
  if (maxExclusive <= 0 || maxExclusive > 256) throw new Error('random_int_range');
  const limit = 256 - (256 % maxExclusive);
  for (;;) {
    const b = randomBytes(1)[0] as number;
    if (b < limit) return b % maxExclusive;
  }
}

// ---- X25519 ----

export function x25519PublicFromSecret(secretHex: string): string {
  return bytesToHex(x25519curve.getPublicKey(hexToBytes(secretHex)));
}

export function generateBoxKeyPair(): KeyPairHex {
  const secret = randomBytes(32);
  return { secret: bytesToHex(secret), pub: x25519PublicFromSecret(bytesToHex(secret)) };
}

/** DH：低阶点/全零输出 → null（noble 原生 throw——转为判别结果，与原实现语义一致）。 */
export function x25519(secretHex: string, peerPublicHex: string): string | null {
  try {
    return bytesToHex(x25519curve.getSharedSecret(hexToBytes(secretHex), hexToBytes(peerPublicHex)));
  } catch {
    return null;
  }
}

// ---- Ed25519 ----

export function fromSecretSigning(seedHex: string): KeyPairHex {
  const secret = hexToBytes(seedHex);
  return { secret: bytesToHex(secret), pub: bytesToHex(ed25519.getPublicKey(secret)) };
}

export function generateSigningKeyPair(): KeyPairHex {
  return fromSecretSigning(bytesToHex(randomBytes(32)));
}

export function signBytes(secretHex: string, message: Uint8Array): string {
  return bytesToHex(ed25519.sign(message, hexToBytes(secretHex)));
}

export function verifyBytes(publicHex: string, message: Uint8Array, signatureHex: string): boolean {
  try {
    return ed25519.verify(hexToBytes(signatureHex), message, hexToBytes(publicHex));
  } catch {
    return false;
  }
}

// ---- AES-256-GCM（布局：ct‖tag(16)——与 node createCipheriv(authTagLength:16) 一致） ----



export function aeadSeal(spec: { key: Uint8Array; nonce: Uint8Array; plaintext: Uint8Array; aad: Uint8Array }): Uint8Array {
  const { key, nonce, plaintext, aad } = spec;
  return gcm(key, nonce, aad).encrypt(plaintext);
}

/** 解密失败返回 null（与 x-harness 原签名一致——ratchet 以 falsy 判 tag-failed）。 */
export function aeadOpen(spec: { key: Uint8Array; nonce: Uint8Array; ciphertext: Uint8Array; aad: Uint8Array }): Uint8Array | null {
  const { ciphertext } = spec;
  if (ciphertext.length < 16) return null;
  try {
    return gcm(spec.key, spec.nonce, spec.aad).decrypt(ciphertext);
  } catch {
    return null;
  }
}

// ---- HKDF-SHA256 / HMAC-SHA256 ----

export function hkdf(spec: { ikm: Uint8Array | string; salt: Uint8Array; info: string; length: number }): Uint8Array {
  const ikm = typeof spec.ikm === 'string' ? hexToBytes(spec.ikm) : spec.ikm;
  return nobleHkdf(sha256, ikm, spec.salt, new TextEncoder().encode(spec.info), spec.length);
}

export function hmacSha256(key: Uint8Array, message: Uint8Array): Uint8Array {
  return nobleHmac(sha256, key, message);
}

export { hexToBytes, bytesToHex };

// ---- HKDF info 域分离常量（线格式钉死；改 = 换 major——与 x-harness crypto.ts 逐字相同） ----

export const HKDF_INFO = {
  pairingChannel: 'xh-remote/pairing-channel/v1',
  ratchetRoot: 'xh-remote/ratchet-root/v1',
  messageKey: 'xh-remote/message-key/v1',
  rekeyRoot: 'xh-remote/rekey-root/v1',
  sas: 'xh-remote/sas/v1',
  relayToken: 'xh-remote/relay-token/v1',
  pake: 'xh-remote/pake/v1',
} as const;

/** nonce = epoch(8B)|dir(1B)|index(8B)（dir：0=配对发起侧→对端，1=反向）；epoch/index 超 2^53 拒绝 */
export function buildNonce(epoch: number, direction: 0 | 1, index: number): Uint8Array {
  if (!Number.isSafeInteger(epoch) || !Number.isSafeInteger(index) || epoch < 0 || index < 0) {
    throw new Error('crypto: nonce epoch/index must be safe integers');
  }
  const nonce = new Uint8Array(17);
  const dv = new DataView(nonce.buffer, nonce.byteOffset, nonce.byteLength);
  dv.setBigUint64(0, BigInt(epoch), false);
  nonce[8] = direction;
  dv.setBigUint64(9, BigInt(index), false);
  return nonce;
}

/** nonce 布局反解（epoch(8 BE)|dir(1)|index(8 BE)）；垃圾返回 null */
export function parseNonce(nonce: Uint8Array): { epoch: number; index: number; direction: number } | null {
  if (nonce.length !== 17) return null;
  const dv = new DataView(nonce.buffer, nonce.byteOffset, nonce.byteLength);
  const epoch = dv.getBigUint64(0, false);
  const index = dv.getBigUint64(9, false);
  if (epoch > BigInt(Number.MAX_SAFE_INTEGER) || index > BigInt(Number.MAX_SAFE_INTEGER)) return null;
  return { epoch: Number(epoch), index: Number(index), direction: nonce[8] ?? 0 };
}

/** AAD = v1|from|to|epoch（L3 头 + 代际） */
export function buildAad(from: string, to: string, epoch: number): Uint8Array {
  return new TextEncoder().encode(`v1|${from}|${to}|${epoch}`);
}
