import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  statSync,
  appendFileSync,
  renameSync,
} from "node:fs";
import { dirname } from "node:path";

import {
  parseSettings,
  SettingsSchema,
  type ProviderConfig,
  type Settings,
} from "@paiapp/contracts";

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

/** 设置写结果：磁盘不可读（坏档保护）时拒绝写并显式失败，不静默丢用户数据。 */
export type SettingsWrite<T> = { ok: true; data: T } | { ok: false; reason: "settings_unreadable" };

export function createFileSettings(settingsFile: string, keyStore: ProviderKeyStore) {
  let cached: Settings | null = null;

  /** 磁盘真值读取（绕过缓存）。文件不在 = 合法空真值；文件在但读/解析失败 =
   *  ok:false——写路径据此拒写（契约「坏档不清空磁盘、仅本次运行用缺省」：
   *  降级缺省绝不作为写基线，否则瞬态读失败后的首次保存会把缺省整体落盘、
   *  静默清空磁盘上的全部 provider/偏好）。 */
  const readDisk = (): { ok: true; settings: Settings } | { ok: false } => {
    try {
      if (!existsSync(settingsFile)) return { ok: true, settings: parseSettings({}) };
      return { ok: true, settings: parseSettings(JSON.parse(readFileSync(settingsFile, "utf8")) as unknown) };
    } catch {
      return { ok: false };
    }
  };

  const read = (): Settings => {
    if (cached !== null) return cached;
    const disk = readDisk();
    // 读失败不缓存降级结果：本次返回缺省（契约），下一次读重试磁盘——缓存降级值
    // 会让「瞬态读失败」（AV 锁/EACCES/外部原子替换窗口）固化为本次运行的常驻视图
    if (!disk.ok) return parseSettings({});
    cached = disk.settings;
    return cached;
  };

  /** 写基线：磁盘可读即以磁盘为基线（读失败窗口自愈）；不可读 → null（调用方拒写）。 */
  const writeBase = (): Settings | null => {
    const disk = readDisk();
    return disk.ok ? disk.settings : null;
  };

  const write = (next: Settings): void => {
    mkdirSync(dirname(settingsFile), { recursive: true });
    // 原子写：先落临时文件再同卷 rename，写盘中途崩溃不产生截断的 settings.json
    // （截断文件会触发 read() 降级默认值，静默清空全部 provider/偏好）
    const tempFile = `${settingsFile}.tmp`;
    writeFileSync(tempFile, `${JSON.stringify(next, null, 2)}\n`);
    renameSync(tempFile, settingsFile);
    cached = next;
  };

  return {
    get(): Settings {
      return read();
    },
    patch(patch: Partial<Settings>): SettingsWrite<Settings> {
      const base = writeBase();
      if (base === null) return { ok: false, reason: "settings_unreadable" };
      const next = SettingsSchema.parse({ ...base, ...patch });
      write(next);
      return { ok: true, data: next };
    },
    listProviders(): ProviderConfig[] {
      return read().providers;
    },
    upsertProvider(input: ProviderConfig & { apiKey?: string }): SettingsWrite<ProviderConfig[]> {
      const base = writeBase();
      if (base === null) return { ok: false, reason: "settings_unreadable" };
      const providers = [
        ...base.providers.filter((provider) => provider.name !== input.name),
        {
          name: input.name,
          baseUrl: input.baseUrl,
          api: input.api,
          models: input.models.map((model) => ({ ...model })),
        },
      ].sort((a, b) => a.name.localeCompare(b.name));
      write({ ...base, providers });
      if (input.apiKey !== undefined)
        keyStore.setKey(input.name, input.apiKey.length > 0 ? input.apiKey : null);
      return { ok: true, data: providers };
    },
    removeProvider(name: string): SettingsWrite<ProviderConfig[]> {
      const base = writeBase();
      if (base === null) return { ok: false, reason: "settings_unreadable" };
      const providers = base.providers.filter((provider) => provider.name !== name);
      write({ ...base, providers });
      keyStore.setKey(name, null);
      return { ok: true, data: providers };
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
        // 超限整档改名归档（保留全部历史供排障/审计——先截断再改名会让归档恒为空文件）
        if (existsSync(logFile) && statSync(logFile).size > maxBytes) {
          renameSync(logFile, `${logFile}.1`);
        }
        // 控制字符清洗（回车换行与 C0 控制区）：审计 message 可能含渲染层可控串，防伪造日志行
        const sanitized = Array.from(message)
          .filter((ch) => ch.charCodeAt(0) >= 0x20)
          .join("")
          .replace(/[\r\n]/g, " ");
        appendFileSync(logFile, `${new Date().toISOString()} ${sanitized}\n`);
      } catch {
        // 日志失败不影响主流程
      }
    },
  };
}
