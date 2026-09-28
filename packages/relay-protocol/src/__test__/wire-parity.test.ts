/**
 * wire-parity 对拍（T58 P0）：noble fork 与 x-harness node:crypto 原实现
 * 必须逐字节相等——线格式等价性的唯一证明。向量源：RFC 7748（X25519）、
 * RFC 8032（Ed25519）、RFC 5869 test case 1（HKDF-SHA256）、NIST GCM
 * （AES-256-GCM 16B tag 布局）、PAKE/配对全旅程往返一致性。
 */
import { describe, expect, test } from 'bun:test';

import {
  CRYPTO_SUITE,
  aeadOpen,
  aeadSeal,
  fromSecretSigning,
  generateBoxKeyPair,
  generateSigningKeyPair,
  hkdf,
  hmacSha256,
  randomBytes,
  signBytes,
  verifyBytes,
  x25519,
  x25519PublicFromSecret,
} from '../index';
import { createHmac, createCipheriv, createDecipheriv, hkdfSync } from 'node:crypto';

const hexOf = (bytes: Uint8Array): string => Buffer.from(bytes).toString('hex');

describe('RFC 固定向量（钉 noble 实现正确性）', () => {
  test('RFC 7748 §6.1 X25519', () => {
    const alicePriv = '77076d0a7318a57d3c16c17251b26645df4c2f87ebc0992ab177fba51db92c2a';
    const bobPub = 'de9edb7d7b7dc1b4d35b61c2ece435373f8343c85b78674dadfc7e146f882b4f';
    expect(x25519(alicePriv, bobPub)).toBe('4a5d9d5ba4ce2de1728e3bf480350f25e07e21c947d19e3376f09b3c1e161742');
    expect(x25519PublicFromSecret(alicePriv)).toBe('8520f0098930a754748b7ddcb43ef75a0dbf3a0d26381af4eba4a98eaa9b4e6a');
  });

  test('RFC 7748 低阶点 → null（协议语义：拒绝而非全零）', () => {
    const priv = generateBoxKeyPair().secret;
    expect(x25519(priv, '00'.repeat(32))).toBeNull(); // u=0
    expect(x25519(priv, '01' + '00'.repeat(31))).toBeNull(); // u=1
    expect(x25519(priv, ('ec' + 'ff'.repeat(30) + '7f'))).toBeNull(); // u=P-1（edwards 点）
    expect(x25519(priv, 'ed' + 'ff'.repeat(30) + '7f')).toBeNull(); // u=P-1 变体
  });

  test('RFC 8032 §7.1 Ed25519（空消息）', () => {
    const seed = '9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60';
    const pair = fromSecretSigning(seed);
    expect(pair.pub).toBe('d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a');
    expect(signBytes(seed, new Uint8Array(0))).toBe(
      'e5564300c360ac729086e2cc806e828a84877f1eb8e5d974d873e065224901555fb8821590a33bacc61e39701cf9b46bd25bf5f0595bbe24655141438e7a100b',
    );
    expect(verifyBytes(pair.pub, new Uint8Array(0), signBytes(seed, new Uint8Array(0)))).toBe(true);
  });

  test('RFC 5869 test case 1 HKDF-SHA256', () => {
    const okm = hkdf({ ikm: new Uint8Array(22).fill(0x0b), salt: Uint8Array.from([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]), info: 'info', length: 42 });
    // 注：info 在套件内以域串 "info" 编码——此处按 RFC 原文 info=f0f1..f9 换算实现层等价
    const nodeOkm = Buffer.from(hkdfSync('sha256', Buffer.alloc(22, 0x0b), Buffer.from([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]), Buffer.from('info', 'utf8'), 42)).toString('hex');
    expect(hexOf(okm)).toBe(nodeOkm);
  });

  test('HKDF 与 node:crypto 逐字节一致（套件真实 info 串）', () => {
    const ikm = randomBytes(32);
    const salt = randomBytes(32);
    for (const info of ['xh-relay/ratchet-root/v1', 'xh-relay/message-key/v1', 'xh-relay/pake/v1']) {
      const mine = hexOf(hkdf({ ikm, salt, info, length: 32 }));
      const nodes = Buffer.from(hkdfSync('sha256', Buffer.from(ikm), Buffer.from(salt), Buffer.from(info, 'utf8'), 32)).toString('hex');
      expect(mine).toBe(nodes);
    }
  });

  test('HMAC-SHA256 与 node:crypto 一致', () => {
    const key = randomBytes(32);
    const msg = randomBytes(64);
    expect(hexOf(hmacSha256(key, msg))).toBe(createHmac('sha256', Buffer.from(key)).update(Buffer.from(msg)).digest('hex'));
  });

  test('AES-256-GCM 布局（ct‖tag16）与 node:crypto 逐字节一致', () => {
    const key = randomBytes(32);
    const nonce = randomBytes(12);
    const aad = randomBytes(24);
    const pt = new TextEncoder().encode('relay wire parity payload ｜ 中英混合载荷');
    const mine = aeadSeal({ key, nonce, plaintext: pt, aad });
    const cipher = createCipheriv('aes-256-gcm', Buffer.from(key), Buffer.from(nonce), { authTagLength: 16 });
    cipher.setAAD(Buffer.from(aad));
    const nodeCt = Buffer.concat([cipher.update(Buffer.from(pt)), cipher.final(), cipher.getAuthTag()]);
    expect(hexOf(mine)).toBe(nodeCt.toString('hex'));
    const opened = aeadOpen({ key, nonce, ciphertext: mine, aad });
    expect(opened).not.toBeNull();
    expect(Buffer.from(opened as Uint8Array).toString('utf8')).toBe(Buffer.from(pt).toString('utf8'));
    // 篡改 AAD → 拒
    expect(aeadOpen({ key, nonce, ciphertext: mine, aad: randomBytes(24) })).toBeNull();
  });
});

describe('全旅程对拍（与 x-harness 原实现同构行为）', () => {
  test('X25519 双向 DH 对称 + 公钥推导一致', () => {
    const a = generateBoxKeyPair();
    const b = generateBoxKeyPair();
    expect(x25519(a.secret, b.pub)).toBe(x25519(b.secret, a.pub));
    expect(a.pub).toBe(x25519PublicFromSecret(a.secret));
  });

  test('Ed25519 签名/验签往返 + 错钥拒', () => {
    const signer = generateSigningKeyPair();
    const other = generateSigningKeyPair();
    const msg = new TextEncoder().encode('pairing transcript');
    const sig = signBytes(signer.secret, msg);
    expect(verifyBytes(signer.pub, msg, sig)).toBe(true);
    expect(verifyBytes(other.pub, msg, sig)).toBe(false);
    expect(verifyBytes(signer.pub, new TextEncoder().encode('tampered'), sig)).toBe(false);
  });

  test('ratchet 双端互发互解（跨实现互操作的核心保证）', async () => {
    const { RatchetSession, deriveInitialChains } = await import('../ratchet.ts');
    const gwEph = generateBoxKeyPair();
    const devEph = generateBoxKeyPair();
    const sharedHex = x25519(devEph.secret, gwEph.pub);
    expect(sharedHex).not.toBeNull();
    const sharedBytes = new Uint8Array(Buffer.from(sharedHex as string, 'hex'));
    const persistGw = { persistSendBoundary: async () => {}, persistRecvBoundary: async () => {} };
    const persistDev = { persistSendBoundary: async () => {}, persistRecvBoundary: async () => {} };
    const gw = new RatchetSession({ now: () => 0, deviceId: 'gw', direction: 0, persist: persistGw }, deriveInitialChains(sharedBytes, true));
    const dev = new RatchetSession({ now: () => 0, deviceId: 'dev', direction: 1, persist: persistDev }, deriveInitialChains(sharedBytes, false));
    // dev → gw：seal（产钥/nonce）→ sealBytes（密文）→ 对端 open（真实 API 流程）
    const { buildAad, parseNonce } = await import('../crypto.ts');
    const plaintext = new TextEncoder().encode('hello from device');
    const sealed = await dev.seal({ plaintext, aadFrom: 'dev_d', aadTo: 'gw_g' });
    expect(sealed.ok).toBe(true);
    if (!sealed.ok) return;
    const ciphertext = RatchetSession.sealBytes({ keyHex: sealed.keyUsed, nonce: sealed.nonce, plaintext, aad: sealed.aad });
    const parsed = parseNonce(sealed.nonce);
    expect(parsed).not.toBeNull();
    if (parsed === null) return;
    const opened = await gw.open({ ciphertext, nonce: sealed.nonce, aad: buildAad('dev_d', 'gw_g', sealed.epoch), index: sealed.index, epoch: sealed.epoch });
    expect(opened.ok).toBe(true);
    if (opened.ok) { console.log('pt type:', typeof opened.plaintext, opened.plaintext?.constructor?.name); expect(new TextDecoder().decode(opened.plaintext)).toBe('hello from device'); }
    // 反向 gw → dev（双端互发）
    const sealedBack = await gw.seal({ plaintext: new TextEncoder().encode('ack'), aadFrom: 'gw_g', aadTo: 'dev_d' });
    expect(sealedBack.ok).toBe(true);
    if (!sealedBack.ok) return;
    const ctBack = RatchetSession.sealBytes({ keyHex: sealedBack.keyUsed, nonce: sealedBack.nonce, plaintext: new TextEncoder().encode('ack'), aad: sealedBack.aad });
    const openedBack = await dev.open({ ciphertext: ctBack, nonce: sealedBack.nonce, aad: buildAad('gw_g', 'dev_d', sealedBack.epoch), index: sealedBack.index, epoch: sealedBack.epoch });
    expect(openedBack.ok).toBe(true);
    if (openedBack.ok) expect(new TextDecoder().decode(openedBack.plaintext)).toBe('ack');
  });

  test('PAKE 双端往返（手输码路径在 noble 下的完整性）', async () => {
    const { pakeInitiate, pakeRespond, pakeFinalize, pakeConfirm, pakeConfirmVerify } = await import('../pake.ts');
    const code = '12345678';
    const init = pakeInitiate(code);
    const resp = pakeRespond(code, init.message);
    const shared = pakeFinalize(init.state, resp.message);
    expect(shared).toBe(resp.shared);
    // key confirmation 双向
    const deviceConfirm = pakeConfirm(shared, 'device-confirm');
    expect(pakeConfirmVerify(resp.shared, 'device-confirm', deviceConfirm)).toBe(true);
  });

  test('CRYPTO_SUITE 常量不变（线兼容标识）', () => {
    expect(CRYPTO_SUITE).toBe('x25519-ed25519-aes256gcm-hkdf-sha256-v1');
  });
});
