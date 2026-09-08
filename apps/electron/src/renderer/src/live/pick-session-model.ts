/** 新会话模型选择：默认模型偏好优先；未设/失效回落当前选择，再回落首个可用模型。 */
export type ModelRef = { provider: string; modelId: string };

export function pickSessionModel(
  models: readonly ModelRef[],
  defaultModel: string | null,
  current: string,
): ModelRef | undefined {
  const key = (model: ModelRef): string => `${model.provider}/${model.modelId}`;
  return models.find((model) => key(model) === defaultModel) ?? models.find((model) => key(model) === current) ?? models[0];
}
