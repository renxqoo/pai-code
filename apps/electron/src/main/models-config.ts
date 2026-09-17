import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import type { ProviderConfig } from "@paiapp/contracts";

/**
 * agentDir/models.json 生成与 env 注入（host-hub 形状：扁平 models[] 条目，
 * 每条 = {id, provider, api, baseUrl, apiKeyEnv, ...能力字段}）。
 * provider 字段 = host-hub 目录 providerId（分组键 + set_model 寻址键），
 * 撞 hub 预设键的 custom 条目会被 readCatalog 静默剔除降级——写前校验在
 * provider/upsert 路由（presetProviderKeys 见下）；key 以 PAI_KEY_<NAME> env
 * 引用注入（hub envFor 进程 env 兜底），不落 models.json。
 */

interface ModelsFile {
  models: Array<Record<string, unknown>>;
  modelOverrides?: Record<string, Record<string, unknown>>;
}

export function envVarNameForProvider(providerName: string): string {
  const sanitized = providerName.replace(/[^A-Za-z0-9_]/g, "_").toUpperCase();
  return `PAI_KEY_${sanitized}`;
}

/** host-hub models.json 的 api 词表（models/add 校验同源）。 */
export const HUB_API_FORMATS = ["anthropic-messages", "openai-completions"] as const;

/** models.json 序列化单一真相：key 不入文件（env 引用），内容只由 providers 决定。 */
export function serializeModelsConfig(providers: readonly ProviderConfig[]): string {
  const file: ModelsFile = { models: [] };
  for (const provider of providers) {
    for (const model of provider.models) {
      file.models.push({
        id: model.id,
        provider: provider.name,
        api: provider.api,
        baseUrl: provider.baseUrl,
        apiKeyEnv: envVarNameForProvider(provider.name),
        ...(model.reasoning ? { reasoning: true } : {}),
        ...(model.vision ? { input: ["text", "image"] } : {}),
        ...(model.contextWindow !== undefined ? { contextWindow: model.contextWindow } : {}),
        ...(model.maxTokens !== undefined ? { maxTokens: model.maxTokens } : {}),
      });
    }
  }
  return `${JSON.stringify(file, null, 2)}\n`;
}

/** 目标 models.json 与磁盘现存是否一致：不一致 = hub 需重启重载（目录在 spawn 期读入）。 */
export function modelsConfigDiffers(
  agentDir: string,
  providers: readonly ProviderConfig[],
): boolean {
  const target = serializeModelsConfig(providers);
  const path = join(agentDir, "models.json");
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
  writeFileSync(join(agentDir, "models.json"), serializeModelsConfig(providers));
  return { env };
}
