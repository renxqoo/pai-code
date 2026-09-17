import { PERM_MODES, type PermMode } from '@paiapp/contracts';

/**
 * 权限模式词表辅助（permission/get_mode|set_mode 与 app/hubSettings 共用枚举）。
 * 读口返回的 mode 是宽松 string（adapter 不收窄）：渲染层展示前经 normalizePermMode
 * 收敛——词表内原样返回，词表外（协议扩展/垃圾输入）回落 default 档。
 */

export function isPermMode(value: string): value is PermMode {
  return (PERM_MODES as readonly string[]).includes(value);
}

/** 宽松读口值 → PermMode（词表外回落 default，不崩溃不臆造新模式）。 */
export function normalizePermMode(value: string): PermMode {
  return isPermMode(value) ? value : 'default';
}
