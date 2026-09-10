import type { ImagePayload } from '@paiapp/contracts';

import { copy } from '@/strings';
import type { WorkspaceActions } from '@/live/workspace-actions';

type SubmitDraftDeps = {
  actions: WorkspaceActions;
  /** 提交成功后清空当前会话草稿。 */
  clearDraft: () => void;
};

/**
 * 即时提交判定：直执行（`! `，容忍前导空白——既有 bash 词法）与斜杠命令
 * （行首 `/`——命令族通用：hub 侧 /compact 拦截、skill/模板展开都是即时
 * 语义，排队冲刷命令无意义）不进生成中暂存。
 */
export function isImmediateSubmit(text: string): boolean {
  return text.trimStart().startsWith('! ') || text.startsWith('/');
}

/**
 * 会话提交语义：行首 `! ` 前缀 = 直执行命令（bash 通路，不进模型轮次、
 * 不支持图片；容忍前导空白）；其余（含 `/compact` 等斜杠命令——hub 的
 * prompt 通路负责拦截与解释）走 submitDraft（auto/steer/followUp）。
 * 结果 false = 拦截处理或失败（草稿保留）。
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
    // trim 后以 '! ' 开头 ⇒ 命令体必非空（尾随空白已被 trim 吃掉），无空命令分支
    const command = trimmed.slice(2).trim();
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
