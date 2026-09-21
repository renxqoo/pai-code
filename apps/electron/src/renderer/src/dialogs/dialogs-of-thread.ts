import type { PendingDialog } from '@/live/store';

const NONE: readonly PendingDialog[] = [];

/**
 * 当前会话可见的待答弹窗：模态呈现只属于发起会话（跨会话切换不得遮挡其他会话
 * 的界面）。全属当前会话时返回原数组引用（渲染层 memo / 选择器稳定的事实基础）；
 * 无可见弹窗时返回模块级空引用。
 */
export function dialogsOfThread(dialogs: readonly PendingDialog[], threadId: string | null): readonly PendingDialog[] {
  if (threadId === null) return NONE;
  if (dialogs.every((dialog) => dialog.threadId === threadId)) return dialogs;
  const visible = dialogs.filter((dialog) => dialog.threadId === threadId);
  return visible.length === 0 ? NONE : visible;
}
