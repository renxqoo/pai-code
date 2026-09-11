import type { ModelInfoView, SessionStatsView, SessionView } from '@paiapp/contracts';
import { thinkingLevelLabel } from '@paiapp/contracts';

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

export function composerSelectionOf(
  models: readonly ModelInfoView[],
  stats: Readonly<Record<string, SessionStatsView>>,
  sessions: Readonly<Record<string, SessionView>>,
  effortLevels: readonly string[],
  threadId: string,
): ComposerSelection {
  const modelOptions = models.map((model) => `${model.provider}/${model.modelId}`);
  const session = sessions[threadId];
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
