import { type ProviderConfig } from '@paiapp/contracts';

import { envVarNameForProvider } from './env-name';

/**
 * agentDir/providers.json 序列化（x-harness 目录形状：档案制 providers[]，
 * 每档案 = {name, protocol, baseUrl, apiKeyEnv, models[]}）。
 * name = x-harness 目录 providerId（分组键 + set_model 寻址键），撞 hub 预设键
 * 是整档覆盖语义（预设视图被遮蔽）——写前校验在 provider/upsert 路由；key 以
 * PAI_KEY_<NAME> env 引用注入（hub 装配快照解析 apiKeyEnv），不落 providers.json。
 * 模型级 reasoning/input 显式写（x-harness 缺省 reasoning=true、缺 input 拒图——
 * 省略即语义翻转，omit-when-false 惯例在此不适用）。
 */

interface ProvidersFile {
  providers: Array<Record<string, unknown>>;
}

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
