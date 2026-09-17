import type { ModelInfoView, SessionView } from '@paiapp/contracts';
import { THINKING_LEVEL_ORDER, isSettableThinkingLevel, thinkingLevelLabel } from '@paiapp/contracts';

import type { ThinkingLevelStateView } from '@/live/store';

/**
 * 输入卡模型/思考档选择数据面：useLiveWorkspace 与 ComposerRegion 共用的单一派生真相。
 * 思考档菜单恒四档（off/low/medium/high——模型级能力推导已退役，能力拒绝按 hub 错误降级）；
 * 当前值优先级：会话读口（get_thinking_level）→ 会话视图携带档位 → 首档展示。
 */

export type ComposerSelection = {
  model: string;
  modelOptions: readonly string[];
  effort: string;
  effortOptions: readonly string[];
};

/** 四档展示名（词表顺序即菜单顺序）。 */
export function thinkingLevelOptions(): string[] {
  return THINKING_LEVEL_ORDER.map((level) => thinkingLevelLabel(level));
}

/**
 * 当前档展示名：读口事实优先，会话视图兜底（parked 未发 worker 级查询）；
 * 均未知或词表外（'unset'/扩展档）回落首档——菜单始终可选，选择即显式设置。
 */
export function thinkingLevelValueOf(thinking: ThinkingLevelStateView | null, session: SessionView | undefined): string {
  const level = thinking?.level ?? session?.thinkingLevel ?? null;
  if (level !== null && isSettableThinkingLevel(level)) return thinkingLevelLabel(level);
  return thinkingLevelOptions()[0] ?? '';
}

export function composerSelectionOf(
  models: readonly ModelInfoView[],
  session: SessionView | undefined,
  thinking: ThinkingLevelStateView | null,
): ComposerSelection {
  const modelOptions = models.map((model) => `${model.provider}/${model.modelId}`);
  return {
    model: session?.model ?? modelOptions[0] ?? '',
    modelOptions,
    effort: thinkingLevelValueOf(thinking, session),
    effortOptions: thinkingLevelOptions(),
  };
}
