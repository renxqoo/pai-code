import { turnEndedAbnormally } from './turn-state';
import type { TurnModel } from './thread-model';

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

/**
 * 行内展开箭头的显形类：收起态靠行 hover / 键盘聚焦浮出（不留静止箭头噪声），
 * 展开态常显（开了就要看得见从哪儿收回去）。调用方行容器需带 `group`。
 */
export function chevronRevealClass(open: boolean): string {
  return open
    ? 'shrink-0 opacity-70'
    : 'shrink-0 opacity-0 transition-opacity duration-150 group-hover:opacity-70 group-focus-within:opacity-70 motion-reduce:transition-none';
}

/**
 * 过程的自动状态：运行中的轮实时展开；异常结束（停止/报错/中止）的轮保持展开——
 * 失败现场（思考/工具/中间文本）不得被收起摘要盖住。只有正常完成的轮收起为摘要 + 最终文本。
 */
export function autoOpenForTurn(turn: Pick<TurnModel, 'status' | 'blocks'>): boolean {
  return turn.status === 'running' || turnEndedAbnormally(turn);
}
