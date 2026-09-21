import { z } from 'zod';

/**
 * 权限模式词表（host-hub permission/set_mode|get_mode 与 settings 键
 * permission.defaultMode 的共用枚举）——三档（x-harness 词表）。
 */

export const PERM_MODES = ['plan', 'auto', 'full'] as const;

export type PermMode = (typeof PERM_MODES)[number];

export const PermModeSchema = z.enum(PERM_MODES);

/** 旧档位读盘归一（default/acceptEdits → auto、fullAuto → full；写侧只产新词表）。 */
export function normalizeLegacyPermMode(value: string): PermMode | undefined {
  if ((PERM_MODES as readonly string[]).includes(value)) return value as PermMode;
  if (value === 'default' || value === 'acceptEdits') return 'auto';
  if (value === 'fullAuto') return 'full';
  return undefined;
}

/** permission/get_mode 响应的 source 词表。 */
export type PermissionModeSource = 'session' | 'project' | 'user' | 'default';
