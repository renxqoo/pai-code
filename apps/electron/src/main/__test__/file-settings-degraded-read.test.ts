import { describe, expect, test } from "bun:test";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createFileSettings, type ProviderKeyStore } from "../file-settings";

/**
 * 红测：降级读缓存的持久化扩散（file-settings.ts createFileSettings）。
 *
 * 声称的 Bug：read() 在读失败/解析失败时把「整档默认值」写入进程内缓存
 * （cached = parseSettings({})），且该缓存永不失效；随后任何一次
 * patch()/upsertProvider() 都会把这份降级快照整体写回磁盘——
 * 磁盘上完好无损的 settings.json（providers/偏好）被静默清空，且不可恢复。
 *
 * 这与 contracts/src/settings.ts:95 的契约直接矛盾：
 * 「无法解析的整体降级默认值（垃圾输入不清空磁盘文件，仅本次运行用缺省）」。
 * 写路径把「仅本次运行用缺省」变成了「下次写入时清空磁盘」。
 *
 * 触发序列（现实中读失败是瞬态的：Windows AV 短暂锁文件、备份软件/外部
 * 编辑器原子替换窗口、EACCES 等）：
 *   1. settings.json 完好（含 provider acme）；
 *   2. 一次 get() 恰逢文件短暂不可读 → 缓存降级为默认值；
 *   3. 权限窗口过去，磁盘文件内容完好如初；
 *   4. 用户改任意偏好（patch）→ 默认值快照落盘 → providers 全部消失。
 */

const keyStore: ProviderKeyStore = {
  encryptionAvailable: false,
  getKey: () => null,
  setKey: () => undefined,
  keyNames: [],
};

const validSettings = {
  providers: [
    {
      name: "acme",
      baseUrl: "https://api.acme.example/v1",
      api: "openai",
      models: [{ id: "m1", reasoning: false }],
    },
  ],
  onboarded: true,
};

describe("createFileSettings 降级读不得持久化清空磁盘", () => {
  test("瞬态读失败后的一次 patch 不得清空磁盘上的 providers", () => {
    const dir = mkdtempSync(join(tmpdir(), "pai-red-settings-"));
    try {
      const settingsFile = join(dir, "settings.json");
      writeFileSync(settingsFile, JSON.stringify(validSettings, null, 2));

      const settings = createFileSettings(settingsFile, keyStore);

      // 瞬态不可读窗口（非 root 下 readFileSync 抛 EACCES → read() 降级缓存默认值）
      chmodSync(settingsFile, 0o000);
      settings.get();
      chmodSync(settingsFile, 0o644); // 窗口过去，磁盘内容完好

      // 用户改一项无关偏好
      settings.patch({ onboarded: true });

      const onDisk = JSON.parse(readFileSync(settingsFile, "utf8")) as {
        providers?: Array<{ name: string }>;
      };
      expect(onDisk.providers?.map((provider) => provider.name)).toContain("acme");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
