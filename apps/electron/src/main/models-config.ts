import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import type { ProviderConfig } from "@paiapp/contracts";
import { envVarNameForProvider, serializeProvidersConfig } from "@paiapp/api";

/**
 * agentDir/providers.json 落盘与重载判定（fs 壳）：序列化单一真相在
 * @paiapp/api verbs/providers-config；hub 目录只在 spawn 期读入，differs
 * 即「需重启重载」信号。
 */

/** 目标 providers.json 与磁盘现存是否一致：不一致 = hub 需重启重载（目录在 spawn 期读入）。 */
export function modelsConfigDiffers(
  agentDir: string,
  providers: readonly ProviderConfig[],
): boolean {
  const target = serializeProvidersConfig(providers);
  const path = join(agentDir, "providers.json");
  try {
    return !existsSync(path) || readFileSync(path, "utf8") !== target;
  } catch {
    return true;
  }
}

export function writeModelsConfig(
  agentDir: string,
  providers: readonly ProviderConfig[],
  keyStore: { getKey(name: string): string | null },
): { env: Record<string, string> } {
  mkdirSync(agentDir, { recursive: true });
  const env: Record<string, string> = {};
  for (const provider of providers) {
    const key = keyStore.getKey(provider.name);
    if (key !== null) env[envVarNameForProvider(provider.name)] = key;
  }
  // 原子写（tmp+rename）：直写的崩溃窗口产生截断档，本次 spawn 的模型面整档缺失零告警
  const target = serializeProvidersConfig(providers);
  const tempFile = join(agentDir, "providers.json.tmp");
  writeFileSync(tempFile, target);
  renameSync(tempFile, join(agentDir, "providers.json"));
  // 旧目录文件（my-agent 期产物）清扫：新写者只认 providers.json，孤儿留存徒增排障噪音
  rmSync(join(agentDir, "models.json"), { force: true });
  return { env };
}
