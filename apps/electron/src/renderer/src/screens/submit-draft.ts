import type { ImagePayload } from '@paiapp/contracts';

import { parseBuiltinCommand } from '@/composer/builtin-commands';
import { copy } from '@/strings';
import type { WorkspaceActions } from '@/live/workspace-actions';

type SubmitDraftDeps = {
  actions: WorkspaceActions;
  /** 提交成功后清空当前会话草稿。 */
  clearDraft: () => void;
};

/**
 * 即时提交判定：直执行（`! `，容忍前导空白——既有 bash 词法）与内置命令
 * （/compact 等，严格行首——与命令高亮/pi 的 startsWith("/") 解释一致）
 * 不进生成中暂存——它们是即时操作，不是轮后要冲刷的消息。
 */
export function isImmediateSubmit(text: string): boolean {
  return text.trimStart().startsWith('! ') || parseBuiltinCommand(text) !== null;
}

/**
 * 会话提交语义：行首 `! ` 前缀 = 直执行命令（bash 通路，不进模型轮次、
 * 不支持图片；容忍前导空白）；行首内置命令（如 `/compact`，首 token 精确
 * 匹配、严格行首）= 本地分派不走模型，后随文字即命令参数（/compact →
 * 压缩附加指示）；其余走 submitDraft（auto/steer/followUp）。
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
  const builtin = parseBuiltinCommand(text);
  if (builtin !== null) {
    switch (builtin.name) {
      case 'compact': {
        if ((images?.length ?? 0) > 0) {
          deps.actions.showNotice(copy.flow.compactNoImages);
          return Promise.resolve(false);
        }
        const customInstructions = builtin.rest.length > 0 ? builtin.rest : undefined;
        return deps.actions.compact(customInstructions).then((accepted) => {
          if (accepted) deps.clearDraft();
          return accepted;
        });
      }
      default: {
        // 注册表新增命令而分派漏接：显式拒绝，绝不静默把命令文本发给模型。
        // never 锁使漏接在编译期先红（新 name 到达这里时不再是 never）。
        const unhandled: never = builtin.name;
        deps.actions.showNotice(copy.flow.commandUnhandled(unhandled));
        return Promise.resolve(false);
      }
    }
  }
  return deps.actions.submitDraft(trimmed, images, mode).then((reason) => {
    if (reason === null) deps.clearDraft();
    return reason === null;
  });
}
