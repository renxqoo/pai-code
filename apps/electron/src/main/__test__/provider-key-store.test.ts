import { describe, expect, mock, test } from 'bun:test';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * provider key 存储回归：加密往返（safeStorage 替身）、删除清算、坏档降级空档、
 * 未加密平台仅内存（重启重录语义）、落盘原子性（tmp+rename，不留残骸、0600 权限）。
 * 装置：mock.module 先于被测模块加载（query 动态导入取未缓存副本）。
 */

const decrypt = (encoded: string): string => {
  const plain = Buffer.from(encoded, 'base64').toString('utf8');
  if (!plain.startsWith('enc:')) throw new Error('bad ciphertext');
  return plain.slice(4);
};

/** safeStorage 替身（可用性按用例切换——同一模块实例上的活绑定，覆盖归因不分裂）。 */
let encryptionOn = true;
mock.module('electron', () => ({
  safeStorage: {
    isEncryptionAvailable: () => encryptionOn,
    encryptString: (plain: string) => Buffer.from(`enc:${plain}`),
    decryptString: (encoded: string) => decrypt(encoded),
  },
}));

const { createProviderKeyStore } = await import('../provider-key-store');

/** 按可用性建店（可用性经替身活绑定即时生效——createProviderKeyStore 构造期读取）。 */
function makeStore(available: boolean, file: string) {
  encryptionOn = available;
  return createProviderKeyStore(file);
}

describe('createProviderKeyStore', () => {
  test('加密往返：setKey 落密文档（0600、无 tmp 残留），getKey 解密并缓存，keyNames 出档案键', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pai-key-store-'));
    try {
      const file = join(dir, 'provider-keys.json');
      const store = makeStore(true, file);
      expect(store.encryptionAvailable).toBe(true);

      store.setKey('glm', 'sk-live-1');
      store.setKey('zai', 'sk-live-2');

      const onDisk = JSON.parse(readFileSync(file, 'utf8')) as { providers: Record<string, string> };
      expect(Object.keys(onDisk.providers).sort()).toEqual(['glm', 'zai']);
      // 落盘是密文（明文不出现在文件里）且临时文件已被 rename 收走
      expect(readFileSync(file, 'utf8')).not.toContain('sk-live-1');
      expect(existsSync(`${file}.tmp`)).toBe(false);
      expect(statSync(file).mode & 0o777).toBe(0o600);

      expect(store.getKey('glm')).toBe('sk-live-1');
      expect(store.getKey('zai')).toBe('sk-live-2');
      expect(store.getKey('missing')).toBeNull();
      expect([...store.keyNames].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))).toEqual(['glm', 'zai']);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('删除清算：setKey(null) 从档案移除该键、其余渠道保留（不被空档基线清掉）', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pai-key-store-del-'));
    try {
      const file = join(dir, 'provider-keys.json');
      const store = makeStore(true, file);
      store.setKey('glm', 'k1');
      store.setKey('zai', 'k2');
      store.setKey('glm', null);

      expect(store.getKey('glm')).toBeNull();
      expect(store.getKey('zai')).toBe('k2');
      expect([...store.keyNames]).toEqual(['zai']);
      const onDisk = JSON.parse(readFileSync(file, 'utf8')) as { providers: Record<string, string> };
      expect(Object.keys(onDisk.providers)).toEqual(['zai']);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('坏档降级：截断 JSON 视为空档——读返 null 不抛，后续写入自愈', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pai-key-store-bad-'));
    try {
      const file = join(dir, 'provider-keys.json');
      writeFileSync(file, '{"providers": {"glm": "trunc');
      const store = makeStore(true, file);
      expect(store.getKey('glm')).toBeNull();

      store.setKey('fresh', 'k-new');
      expect(store.getKey('fresh')).toBe('k-new');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('未加密平台：仅内存（不落盘），重启重录语义（新实例读不回）', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pai-key-store-mem-'));
    try {
      const file = join(dir, 'provider-keys.json');
      const store = makeStore(false, file);
      expect(store.encryptionAvailable).toBe(false);

      store.setKey('glm', 'sk-memory');
      expect(store.getKey('glm')).toBe('sk-memory');
      expect([...store.keyNames]).toEqual(['glm']);
      // 不落盘：新实例（模拟重启）读不回
      expect(existsSync(file)).toBe(false);
      const rebooted = makeStore(false, file);
      expect(rebooted.getKey('glm')).toBeNull();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('密文损坏：decrypt 抛错 → getKey 返 null 不击穿', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pai-key-store-corrupt-'));
    try {
      const file = join(dir, 'provider-keys.json');
      writeFileSync(file, JSON.stringify({ providers: { glm: Buffer.from('not-enc').toString('base64') } }));
      const store = makeStore(true, file);
      expect(store.getKey('glm')).toBeNull();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
