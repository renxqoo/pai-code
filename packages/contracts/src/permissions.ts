import { z } from 'zod';

/**
 * 权限模式词表（host-hub permission/set_mode|get_mode 与 settings 键
 * permission.defaultMode 共用）。词表单一真相 = host 侧词表（permission/get_mode
 * 响应的 modes 字段，随 permission.profiles 扩档）——wire/UI 值域是开放 string，
 * host 是值域校验单点。PERM_MODES 只是 host 词表缺席（测试夹具/离线装配）时的
 * 内置缺省；词表随读口响应的 modes 字段流到消费方，不设模块级状态。
 */

export const PERM_MODES = ['plan', 'auto', 'edit-confirm', 'full', 'sandboxed-auto'] as const;

/** 内置缺省词表的静态面：只服务封闭事实——文案表键齐备（Record<KnownPermMode, string>）、
 *  旧档映射目标、缺省值。动态边界（菜单选项、setMode 入参、读口视图）一律裸 string。 */
export type KnownPermMode = (typeof PERM_MODES)[number];

/** 内置缺省词表成员判定（已知面：文案查表、静态分支）。 */
export function isKnownPermMode(value: string): value is KnownPermMode {
  return (PERM_MODES as readonly string[]).includes(value);
}

/** 形态护栏（发前垃圾拦截空串）；值域校验单点 = host（settings/set 与 set_mode 侧收口）。 */
export const PermModeSchema = z.string().min(1);

/** 旧档读盘映射（default/acceptEdits → auto、fullAuto → full）；现词表值不直通——
 *  直通职责归 normalizePermMode/resolveStoredPermMode 的组合。 */
export function mapLegacyPermMode(value: string): KnownPermMode | undefined {
  if (value === 'default' || value === 'acceptEdits') return 'auto';
  if (value === 'fullAuto') return 'full';
  return undefined;
}

/** 展示收敛：词表内原样 → 旧档映射 → 回落 auto（垃圾输入降级，不崩溃不臆造新模式）。 */
export function normalizePermMode(value: string, vocab: readonly string[]): string {
  if (vocab.includes(value)) return value;
  return mapLegacyPermMode(value) ?? 'auto';
}

/** 读盘收敛（settings 键 permission.defaultMode）：旧档映射 → 词表内透传 →
 *  词表外视为未设置（null）。 */
export function resolveStoredPermMode(value: string, vocab: readonly string[]): string | null {
  const mapped = mapLegacyPermMode(value);
  if (mapped !== undefined) return mapped;
  return vocab.includes(value) ? value : null;
}

/** host 词表载荷收敛：合法非空 string[] 原样取；缺席/坏值回落内置缺省
 *  （空数组/空词条拒收——防坏响应清空选项面）。 */
export function permVocabOf(modes: unknown): string[] {
  return Array.isArray(modes) && modes.length > 0 && modes.every((m) => typeof m === 'string' && m.length > 0) ? [...modes] : [...PERM_MODES];
}

/** permission/get_mode 响应的 source 词表。 */
export type PermissionModeSource = 'session' | 'project' | 'user' | 'default';
