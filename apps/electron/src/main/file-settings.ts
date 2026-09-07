import { readFileSync, writeFileSync, mkdirSync, existsSync, truncateSync, statSync, appendFileSync, renameSync } from 'node:fs';
import { dirname } from 'node:path';

import { SettingsSchema, type ProviderConfig, type Settings } from '@paiapp/contracts';

/**
 * 设置读写：settings.json（无 key）+ provider-keys.json（safeStorage 加密）。
 * 坏文件降级为默认值（垃圾输入不崩溃）；key 永不写入日志与设置文件。
 */

export interface ProviderKeyStore {
  /** 加密不可用平台：key 只留内存（重启需重录）。 */
  readonly encryptionAvailable: boolean;
  getKey(providerName: string): string | null;
  setKey(providerName: string, key: string | null): void;
  readonly keyNames: readonly string[];
}

export function createFileSettings(settingsFile: string, keyStore: ProviderKeyStore) {
  let cached: Settings | null = null;

  const read = (): Settings => {
    if (cached !== null) return cached;
    let parsed: unknown = {};
    try {
      if (existsSync(settingsFile)) {
        parsed = JSON.parse(readFileSync(settingsFile, 'utf8')) as unknown;
      }
    } catch {
      parsed = {};
    }
    cached = SettingsSchema.parse(parsed);
    return cached;
  };

  const write = (next: Settings): void => {
    mkdirSync(dirname(settingsFile), { recursive: true });
    writeFileSync(settingsFile, `${JSON.stringify(next, null, 2)}\n`);
    cached = next;
  };

  return {
    get(): Settings {
      return read();
    },
    patch(patch: Partial<Settings>): Settings {
      const next = SettingsSchema.parse({ ...read(), ...patch });
      write(next);
      return next;
    },
    listProviders(): ProviderConfig[] {
      return read().providers;
    },
    upsertProvider(input: ProviderConfig & { apiKey?: string }): ProviderConfig[] {
      const current = read();
      const providers = [
        ...current.providers.filter((provider) => provider.name !== input.name),
        { name: input.name, baseUrl: input.baseUrl, api: input.api, models: input.models },
      ].sort((a, b) => a.name.localeCompare(b.name));
      write({ ...current, providers });
      if (input.apiKey !== undefined) keyStore.setKey(input.name, input.apiKey.length > 0 ? input.apiKey : null);
      return providers;
    },
    removeProvider(name: string): ProviderConfig[] {
      const current = read();
      const providers = current.providers.filter((provider) => provider.name !== name);
      write({ ...current, providers });
      keyStore.setKey(name, null);
      return providers;
    },
  };
}

/** 尺寸封顶的追加日志（超限轮转：main.log → main.log.1）。 */
export function createFileLogger(logFile: string, maxBytes = 1_024 * 1_024) {
  const ensureDir = (): void => {
    mkdirSync(dirname(logFile), { recursive: true });
  };
  return {
    log(message: string): void {
      try {
        ensureDir();
        if (existsSync(logFile) && statSync(logFile).size > maxBytes) {
          truncateSync(logFile, 0);
          renameSync(logFile, `${logFile}.1`);
        }
        appendFileSync(logFile, `${new Date().toISOString()} ${message}\n`);
      } catch {
        // 日志失败不影响主流程
      }
    },
  };
}
