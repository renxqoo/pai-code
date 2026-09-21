import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { API_FORMAT_IDS, type ProviderConfig } from "@paiapp/contracts";

/**
 * agentDir/providers.json 生成与 env 注入（x-harness 目录形状：档案制
 * providers[]，每档案 = {name, protocol, baseUrl, apiKeyEnv, models[]}）。
 * name = x-harness 目录 providerId（分组键 + set_model 寻址键），撞 hub 预设键
 * 是整档覆盖语义（预设视图被遮蔽）——写前校验在 provider/upsert 路由；key 以
 * PAI_KEY_<NAME> env 引用注入（hub 装配快照解析 apiKeyEnv），不落 providers.json。
 * 模型级 reasoning/input 显式写（x-harness 缺省 reasoning=true、缺 input 拒图——
 * 省略即语义翻转，omit-when-false 惯例在此不适用）。
 */

interface ProvidersFile {
  providers: Array<Record<string, unknown>>;
}

import { envVarNameForProvider } from '@paiapp/api';
export { envVarNameForProvider };

/** providers.json 的 protocol 词表（x-harness catalog 同源）。 */
export const HUB_API_FORMATS = API_FORMAT_IDS;

/** providers.json 序列化单一真相：key 不入文件（env 引用），内容只由 providers 决定。 */
export function serializeProvidersConfig(providers: readonly ProviderConfig[]): string {
  const file: ProvidersFile = { providers: [] };
  for (const provider of providers) {
    file.providers.push({
      name: provider.name,
      protocol: provider.api,
      baseUrl: provider.baseUrl,
      apiKeyEnv: envVarNameForProvider(provider.name),
      models: provider.models.map((model) => ({
        id: model.id,
        reasoning: model.reasoning,
        ...(model.vision ? { input: ["text", "image"] as const } : {}),
        ...(model.contextWindow !== undefined ? { contextWindow: model.contextWindow } : {}),
        ...(model.maxTokens !== undefined ? { maxTokens: model.maxTokens } : {}),
      })),
    });
  }
  return `${JSON.stringify(file, null, 2)}\n`;
}

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
  writeFileSync(join(agentDir, "providers.json"), serializeProvidersConfig(providers));
  // 旧目录文件（my-agent 期产物）清扫：新写者只认 providers.json，孤儿留存徒增排障噪音
  rmSync(join(agentDir, "models.json"), { force: true });
  return { env };
}
