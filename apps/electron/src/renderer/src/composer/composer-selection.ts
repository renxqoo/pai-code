import type { ModelInfoView, SessionStatsView, SessionView } from '@paiapp/contracts';
import { supportedThinkingLevels, thinkingLevelLabel } from '@paiapp/contracts';

/**
 * 输入卡模型/思考档选择数据面（T33：自 use-live-workspace 的 buildComposer
 * 同构迁出）：useLiveWorkspace 与 ComposerRegion 共用的单一派生真相。
 * 思考档以模型能力列表为真相：拉取前/不支持时为空，控件侧禁用并给原因（不臆造默认档）。
 */

export type ComposerSelection = {
  model: string;
  modelOptions: readonly string[];
  effort: string;
  effortOptions: readonly string[];
  contextUsed: number;
};

/**
 * 模型 key（provider/modelId）→ 可用思考档协议值：按模型能力本地推导
 * （无线程/未唤醒时的唯一数据源；live 态以 hub 档位命令为准；展示名映射统一由
 * composerSelectionOf 做——state 语义单一）。新任务页 effortOptionsFor 同源。
 */
export function effortLevelsForModel(models: readonly ModelInfoView[], modelKey: string): string[] {
  const model = models.find((entry) => `${entry.provider}/${entry.modelId}` === modelKey);
  return [...supportedThinkingLevels(model)];
}

export function composerSelectionOf(
  models: readonly ModelInfoView[],
  stats: Readonly<Record<string, SessionStatsView>>,
  session: SessionView | undefined,
  effortLevels: readonly string[],
): ComposerSelection {
  const modelOptions = models.map((model) => `${model.provider}/${model.modelId}`);
  const currentModel = session?.model ?? modelOptions[0] ?? '';
  const levelLabels = effortLevels.map((level) => thinkingLevelLabel(level));
  const currentLabel = session?.thinkingLevel !== undefined && session?.thinkingLevel !== null ? thinkingLevelLabel(session.thinkingLevel) : undefined;
  // 未知档位回落到第一个可选档；无可选档时留空（触发禁用态）
  const effort = currentLabel ?? levelLabels[0] ?? '';
  return {
    model: currentModel,
    modelOptions,
    effort,
    effortOptions: levelLabels,
    contextUsed: stats[session?.threadId ?? '']?.contextUsage ?? 0,
  };
}
