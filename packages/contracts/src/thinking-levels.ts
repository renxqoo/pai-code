/**
 * 思考档位词表与模型能力计算（镜像 pi-ai getSupportedThinkingLevels 语义）。
 * 词表 = hub 协议 set_thinking_level 的 level 枚举；某档是否可用由模型能力决定：
 * 不支持思考的模型只有 off；thinkingLevelMap 显式 null 的档被剔除；
 * xhigh/max 两档仅在显式映射时可用（缺省键 = provider 默认，其余五档直接可用）。
 */

export const THINKING_LEVEL_ORDER = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'] as const;

export type ThinkingLevel = (typeof THINKING_LEVEL_ORDER)[number];

export const THINKING_LEVEL_LABELS: Readonly<Record<ThinkingLevel, string>> = {
  off: 'Off',
  minimal: 'Minimal',
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  xhigh: 'X-high',
  max: 'Max',
};

/** 档位展示名（未知档位回落原值——手写 models.json 可能带词表外扩展档）。 */
export function thinkingLevelLabel(level: string): string {
  return (THINKING_LEVEL_LABELS as Readonly<Record<string, string>>)[level] ?? level;
}

/** 展示名 → 档位值（词表外展示名回落原值：扩展档的展示名即档位值本身）。 */
export function thinkingLevelOfLabel(label: string): string {
  const entry = Object.entries(THINKING_LEVEL_LABELS).find(([, text]) => text === label);
  return entry?.[0] ?? label;
}

/** 模型思考能力面（ModelInfoView 的子集；reasoning 缺省/非 true = 不支持思考）。 */
export type ModelThinkingCapability = {
  reasoning?: boolean;
  thinkingLevelMap?: Readonly<Record<string, string | null>>;
};

/** 模型可用思考档（hub 侧 get_thinking_levels 只按线程寻址，无线程时按此本地计算）。 */
export function supportedThinkingLevels(model: ModelThinkingCapability | undefined): readonly ThinkingLevel[] {
  if (model?.reasoning !== true) return ['off'];
  return THINKING_LEVEL_ORDER.filter((level) => {
    const mapped = model.thinkingLevelMap?.[level];
    if (mapped === null) return false;
    if (level === 'xhigh' || level === 'max') return mapped !== undefined;
    return true;
  });
}
