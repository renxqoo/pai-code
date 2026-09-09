import type { ProviderModel } from "@paiapp/contracts";

/** 切换单个模型的布尔能力位（id 不存在时原样返回）。 */
export function toggleModelFlag(
  models: readonly ProviderModel[],
  id: string,
  flag: "reasoning" | "vision",
): ProviderModel[] {
  return models.map((model) => (model.id === id ? { ...model, [flag]: !model[flag] } : model));
}
