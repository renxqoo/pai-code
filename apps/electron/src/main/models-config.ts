import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import type { ProviderConfig } from '@paiapp/contracts';

import type { ProviderKeyStore } from './file-settings';

/**
 * agentDir/models.json 生成与 env 注入：
 * 自定义 provider 的 key 以 $PAI_KEY_<NAME> 引用（值经 env 注入，不落 models.json）。
 */

interface ModelsFile {
  providers: Record<string, unknown>;
}

export function envVarNameForProvider(providerName: string): string {
  const sanitized = providerName.replace(/[^A-Za-z0-9_]/g, '_').toUpperCase();
  return `PAI_KEY_${sanitized}`;
}

export function writeModelsConfig(agentDir: string, providers: readonly ProviderConfig[], keyStore: ProviderKeyStore): { env: Record<string, string> } {
  mkdirSync(agentDir, { recursive: true });
  const file: ModelsFile = { providers: {} };
  const env: Record<string, string> = {};
  for (const provider of providers) {
    const key = keyStore.getKey(provider.name);
    file.providers[provider.name] = {
      baseUrl: provider.baseUrl,
      api: provider.api,
      apiKey: `$${envVarNameForProvider(provider.name)}`,
      models: provider.models.map((id) => ({ id })),
    };
    if (key !== null) env[envVarNameForProvider(provider.name)] = key;
  }
  writeFileSync(join(agentDir, 'models.json'), `${JSON.stringify(file, null, 2)}\n`);
  return { env };
}
