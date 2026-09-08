import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import type { ProviderConfig } from '@paiapp/contracts';

import type { ProviderKeyStore } from './file-settings';

/**
 * agentDir/models.json 生成与 env 注入：
 * 自定义 provider 的 key 以 $PAI_KEY_<NAME> 引用（值经 env 注入，不落 models.json）；
 * 模型条目携带 reasoning 能力（决定思考档位可选）与 vision 模态（true 写 input:["text","image"]——
 * pi 对未声明视觉的自定义模型按纯文本处理，发送时图片会被剥成占位文本），
 * provider 级 compat.thinkingFormat 决定思考参数的线上形态（zai=thinking 开关、qwen=enable_thinking、…）。
 */

interface ModelsFile {
  providers: Record<string, unknown>;
}

export function envVarNameForProvider(providerName: string): string {
  const sanitized = providerName.replace(/[^A-Za-z0-9_]/g, '_').toUpperCase();
  return `PAI_KEY_${sanitized}`;
}

/** models.json 序列化单一真相：key 不入文件（$ENV 引用），内容只由 providers 决定。 */
export function serializeModelsConfig(providers: readonly ProviderConfig[]): string {
  const file: ModelsFile = { providers: {} };
  for (const provider of providers) {
    file.providers[provider.name] = {
      baseUrl: provider.baseUrl,
      api: provider.api,
      apiKey: `$${envVarNameForProvider(provider.name)}`,
      ...(provider.thinkingFormat !== 'default' ? { compat: { thinkingFormat: provider.thinkingFormat } } : {}),
      models: provider.models.map((model) => ({
        id: model.id,
        ...(model.reasoning ? { reasoning: true } : {}),
        ...(model.vision ? { input: ['text', 'image'] } : {}),
      })),
    };
  }
  return `${JSON.stringify(file, null, 2)}\n`;
}

/** 目标 models.json 与磁盘现存是否一致：不一致 = hub 需重启重载（ModelConfig 仅启动时读入）。 */
export function modelsConfigDiffers(agentDir: string, providers: readonly ProviderConfig[]): boolean {
  const target = serializeModelsConfig(providers);
  const path = join(agentDir, 'models.json');
  try {
    return !existsSync(path) || readFileSync(path, 'utf8') !== target;
  } catch {
    return true;
  }
}

export function writeModelsConfig(agentDir: string, providers: readonly ProviderConfig[], keyStore: ProviderKeyStore): { env: Record<string, string> } {
  mkdirSync(agentDir, { recursive: true });
  const env: Record<string, string> = {};
  for (const provider of providers) {
    const key = keyStore.getKey(provider.name);
    if (key !== null) env[envVarNameForProvider(provider.name)] = key;
  }
  writeFileSync(join(agentDir, 'models.json'), serializeModelsConfig(providers));
  return { env };
}
