import { currentPermModes, normalizeLegacyPermMode, type PermMode } from '@paiapp/contracts';

/**
 * 权限模式词表辅助（permission/get_mode|set_mode 与 app/hubSettings 共用枚举）。
 * 词表单一真相 = host（permission/mode 响应的 modes 字段动态收敛；host 缺席回落
 * contracts 内置缺省）。读口返回的 mode 是宽松 string（映射层不收窄）：渲染层
 * 展示前经 normalizePermMode 收敛——词表内原样返回，旧 4 档存量值归一
 * （default/acceptEdits→auto、fullAuto→full），词表外（垃圾输入）回落 auto。
 */

export function isPermMode(value: string): value is PermMode {
  return currentPermModes().includes(value);
}

/** 宽松读口值 → PermMode（旧 4 档归一；词表外回落 auto，不崩溃不臆造新模式）。 */
export function normalizePermMode(value: string): PermMode {
  if (isPermMode(value)) return value;
  return normalizeLegacyPermMode(value) ?? 'auto';
}
