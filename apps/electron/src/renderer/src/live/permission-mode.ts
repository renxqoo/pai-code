import { PERM_MODES, type PermMode } from '@paiapp/contracts';

/**
 * 权限模式词表辅助（permission/get_mode|set_mode 与 app/hubSettings 共用枚举——
 * x-harness 三档）。读口返回的 mode 是宽松 string（adapter 不收窄）：渲染层展示前
 * 经 normalizePermMode 收敛——词表内原样返回，旧 4 档存量值归一
 * （default/acceptEdits→auto、fullAuto→full），词表外（协议扩展/垃圾输入）回落 auto。
 */

import { normalizeLegacyPermMode } from '@paiapp/contracts';

export function isPermMode(value: string): value is PermMode {
  return (PERM_MODES as readonly string[]).includes(value);
}

/** 宽松读口值 → PermMode（旧 4 档归一；词表外回落 auto，不崩溃不臆造新模式）。 */
export function normalizePermMode(value: string): PermMode {
  if (isPermMode(value)) return value;
  return normalizeLegacyPermMode(value) ?? 'auto';
}
