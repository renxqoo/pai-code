import { z } from 'zod';

/**
 * 权限模式词表（host-hub permission/set_mode|get_mode 与 settings 键
 * permission.defaultMode 的共用枚举）。
 * 旧 pai 规则 JSON 域（permission-rules.json / 会话 sidecar）已随后端替换退役。
 */

export const PERM_MODES = ['plan', 'default', 'acceptEdits', 'fullAuto'] as const;

export type PermMode = (typeof PERM_MODES)[number];

export const PermModeSchema = z.enum(PERM_MODES);

/** permission/get_mode 响应的 source 词表。 */
export type PermissionModeSource = 'session' | 'project' | 'user' | 'default';
