/**
 * 思考档位词表（host-hub set/get_thinking_level 的 level 枚举镜像）。
 * set 词表 = 四档；unset 仅出现在 get 回退（各级均未设置）。
 * 某档是否实际可用由 hub 侧 dialSupportsThinking 校验（模型不支持/预算超限拒绝）
 * ——app 发送前只做词表校验，能力拒绝按错误 toast 降级（get_models 无能力位，无法预判）。
 */

export const THINKING_LEVEL_ORDER = ['off', 'low', 'medium', 'high'] as const;

export type ThinkingLevel = (typeof THINKING_LEVEL_ORDER)[number];

/** get 回退值（各级均未设置，按 source 层级回退）。 */
export const THINKING_LEVEL_UNSET = 'unset' as const;
export type ThinkingLevelRead = ThinkingLevel | typeof THINKING_LEVEL_UNSET;

export const THINKING_LEVEL_LABELS: Readonly<Record<ThinkingLevel, string>> = {
  off: 'Off',
  low: 'Low',
  medium: 'Medium',
  high: 'High',
};

/** 档位展示名（未知档位回落原值——手写配置可能带词表外扩展档）。 */
export function thinkingLevelLabel(level: string): string {
  return (THINKING_LEVEL_LABELS as Readonly<Record<string, string>>)[level] ?? level;
}

/** 展示名 → 档位值（词表外展示名回落原值：扩展档的展示名即档位值本身）。 */
export function thinkingLevelOfLabel(label: string): string {
  const entry = Object.entries(THINKING_LEVEL_LABELS).find(([, text]) => text === label);
  return entry?.[0] ?? label;
}

/** set 词表判定（词表外值 hub 静默忽略——app 侧先行拒绝）。 */
export function isSettableThinkingLevel(value: string): value is ThinkingLevel {
  return (THINKING_LEVEL_ORDER as readonly string[]).includes(value);
}
