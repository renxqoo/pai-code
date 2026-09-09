import type { ProviderModel } from '@paiapp/contracts';

/** 逗号（半角/全角）或换行切分、trim、去空。 */
export function parseModelIds(raw: string): string[] {
  return raw
    .split(/[,，\n]/)
    .map((id) => id.trim())
    .filter((id) => id.length > 0);
}

/** 新模型 id 并入列表（去重保序；新录入默认不声明思考/视觉能力）。 */
export function mergeModelIds(models: readonly ProviderModel[], ids: readonly string[]): ProviderModel[] {
  const next = [...models];
  for (const id of ids) {
    if (!next.some((model) => model.id === id)) next.push({ id, reasoning: false, vision: false });
  }
  return next;
}

/** 切换单个模型的布尔能力位（id 不存在时原样返回）。 */
export function toggleModelFlag(models: readonly ProviderModel[], id: string, flag: 'reasoning' | 'vision'): ProviderModel[] {
  return models.map((model) => (model.id === id ? { ...model, [flag]: !model[flag] } : model));
}
