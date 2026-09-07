import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

import { safeStorage } from 'electron';

import type { ProviderKeyStore } from './file-settings';

/**
 * provider key 存储：safeStorage 加密（可用时）或仅内存（不可用平台）。
 * 文件形态 { providers: { [name]: base64(encrypted) } }；内存明文只存在于本进程。
 */
export function createProviderKeyStore(providerKeysFile: string): ProviderKeyStore {
  const encryptionAvailable = safeStorage.isEncryptionAvailable();
  /** name → 明文 key（解密后缓存；未加密平台的会话级存储）。 */
  const memory = new Map<string, string>();
  /** 未加密平台标记「曾录入」的名字集合（重启后 key 需重录）。 */
  const memoryNames = new Set<string>();

  interface KeyFile {
    providers: Record<string, string>;
  }

  const readFile = (): KeyFile => {
    try {
      if (!existsSync(providerKeysFile)) return { providers: {} };
      const parsed = JSON.parse(readFileSync(providerKeysFile, 'utf8')) as unknown;
      if (typeof parsed === 'object' && parsed !== null && typeof (parsed as KeyFile).providers === 'object') {
        return parsed as KeyFile;
      }
    } catch {
      // 坏文件视为空
    }
    return { providers: {} };
  };

  const writeFile = (file: KeyFile): void => {
    mkdirSync(dirname(providerKeysFile), { recursive: true });
    writeFileSync(providerKeysFile, JSON.stringify(file));
  };

  return {
    encryptionAvailable,
    getKey(providerName: string): string | null {
      if (memory.has(providerName)) return memory.get(providerName) ?? null;
      if (!encryptionAvailable) return null;
      const stored = readFile().providers[providerName];
      if (typeof stored !== 'string' || stored.length === 0) return null;
      try {
        const key = safeStorage.decryptString(Buffer.from(stored, 'base64'));
        memory.set(providerName, key);
        return key;
      } catch {
        return null;
      }
    },
    setKey(providerName: string, key: string | null): void {
      if (key === null) {
        memory.delete(providerName);
        memoryNames.delete(providerName);
        const file = readFile();
        if (providerName in file.providers) {
          const providers = Object.fromEntries(Object.entries(file.providers).filter(([name]) => name !== providerName));
          writeFile({ providers });
        }
        return;
      }
      memory.set(providerName, key);
      memoryNames.add(providerName);
      if (!encryptionAvailable) return;
      const file = readFile();
      file.providers[providerName] = safeStorage.encryptString(key).toString('base64');
      writeFile(file);
    },
    get keyNames(): readonly string[] {
      if (encryptionAvailable) return Object.keys(readFile().providers);
      return [...memoryNames];
    },
  };
}
