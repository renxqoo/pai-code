import { z } from 'zod';

/**
 * 权限模式词表（host-hub permission/set_mode|get_mode 与 settings 键
 * permission.defaultMode 的共用枚举）。单一真相 = host 侧词表（permission/get_mode
 * 响应的 modes 字段）；本常量只是 host 词表缺席（测试夹具/离线装配）时的内置缺省，
 * 运行时经 setPermModes 收敛为 host 词表——协议加档时 UI 零改。
 */

export const PERM_MODES = ['plan', 'auto', 'edit-confirm', 'full', 'sandboxed-auto'] as const;

export type PermMode = string;

/** 动态词表：setPermModes 收敛后 currentPermModes 即 host 词表（UI 选项渲染源）。 */
let permModes: readonly string[] = [...PERM_MODES];

export function setPermModes(modes: readonly string[]): void {
  if (modes.length > 0) permModes = [...modes];
}

export function currentPermModes(): readonly string[] {
  return [...permModes];
}

/** 词表校验（动态）：词表内通过，词表外拒绝——host 是校验单点，此处只做发前拦截。 */
export const PermModeSchema = z.string().refine((value) => permModes.includes(value), { message: 'unknown permission mode' });

/** 旧档位读盘归一（default/acceptEdits → auto、fullAuto → full；写侧只产 host 词表）。 */
export function normalizeLegacyPermMode(value: string): PermMode | undefined {
  if (value === 'default' || value === 'acceptEdits') return 'auto';
  if (value === 'fullAuto') return 'full';
  return undefined;
}

/** permission/get_mode 响应的 source 词表。 */
export type PermissionModeSource = 'session' | 'project' | 'user' | 'default';
