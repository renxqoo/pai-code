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

/** 模型键 `provider/modelId` → 结构（首个 '/' 切分；缺段返回 null）。与 pickSessionModel 的键格式同一真相。 */
export function parseModelKey(value: string): ModelRef | null {
  const index = value.indexOf('/');
  if (index <= 0 || index === value.length - 1) return null;
  return { provider: value.slice(0, index), modelId: value.slice(index + 1) };
}
