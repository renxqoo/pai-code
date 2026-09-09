import type { ImagePayload } from '@paiapp/contracts';

import { copy } from '@/strings';
import type { WorkspaceActions } from '@/live/workspace-actions';

type SubmitDraftDeps = {
  actions: WorkspaceActions;
  /** 提交成功后清空当前会话草稿。 */
  clearDraft: () => void;
};

/**
 * 会话提交语义：行首 `! ` 前缀 = 直执行命令（bash 通路，不进模型轮次、
 * 不支持图片）；其余走 submitDraft（auto/steer/followUp）。结果 null = 成功。
 */
export function submitDraftText(
  deps: SubmitDraftDeps,
  text: string,
  images?: readonly ImagePayload[],
  mode: 'auto' | 'steer' | 'followUp' = 'auto',
): Promise<boolean> {
  const trimmed = text.trim();
  if (trimmed.length === 0) return Promise.resolve(false);
  if (trimmed.startsWith('! ')) {
    const command = trimmed.slice(2).trim();
    if (command.length === 0) return Promise.resolve(false);
    if ((images?.length ?? 0) > 0) {
      deps.actions.showNotice(copy.flow.bashNoImages);
      return Promise.resolve(false);
    }
    return deps.actions.runBash(command).then((reason) => {
      if (reason === null) deps.clearDraft();
      return reason === null;
    });
  }
  return deps.actions.submitDraft(trimmed, images, mode).then((reason) => {
    if (reason === null) deps.clearDraft();
    return reason === null;
  });
}
