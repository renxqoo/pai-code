import { copy } from '@/strings';

/**
 * 切分支点击时守卫（行不禁用——原因在点击时检查并反馈，渲染层不做灰行预判）：
 * 返回不可切原因文案（锁定），null = 可切（脏区等由 verb 恒重评，
 * 真冲突弹冲突清单知情裁决）。
 */
export function switchBlockedReason(locked: boolean, runningCount: number): string | null {
  if (locked) return copy.branch.lockReason(runningCount);
  return null;
}
