import { clonePermissionRules, type PermissionRules } from '@paiapp/contracts';

/**
 * 会话权限模式切换的下一份规则：以当前生效规则（sidecar 优先，否则全局）
 * 为基线只改 mode——无 sidecar 时建副本不丢全局 patterns。
 * 同模式返回 null（无操作哨兵：不写、不无谓创建 sidecar）。
 */
export function nextSessionRulesForMode(current: PermissionRules, mode: PermissionRules['mode']): PermissionRules | null {
  if (current.mode === mode) return null;
  return { ...clonePermissionRules(current), mode };
}
