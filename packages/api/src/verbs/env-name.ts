/** 渠道名 → key 环境变量名（providers.json apiKeyEnv 约定；纯函数随 verbs 入包）。 */
export function envVarNameForProvider(providerName: string): string {
  return `PAI_KEY_${providerName.replace(/[^A-Za-z0-9_]/g, "_").toUpperCase()}`;
}
