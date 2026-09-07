import type { TurnStatus } from './thread-model';

/**
 * 折叠偏好：null = 跟随自动状态；true/false = 用户手动意图。
 * 手动意图一旦记录就优先于自动状态，直到用户再次手动切换。
 */
export type CollapsePref = boolean | null;

/** 生效的开合状态：手动意图优先，未表态时跟随自动。 */
export function resolveOpen(pref: CollapsePref, autoOpen: boolean): boolean {
  if (pref !== null) return pref;
  return autoOpen;
}

/** 切换开关：记录与当前生效状态相反的手动意图。 */
export function flipPref(pref: CollapsePref, autoOpen: boolean): CollapsePref {
  return !resolveOpen(pref, autoOpen);
}

/** 过程块的自动状态：运行中的轮全部展开，结束的轮折叠为摘要。 */
export function autoOpenForTurn(status: TurnStatus): boolean {
  return status === 'running';
}
