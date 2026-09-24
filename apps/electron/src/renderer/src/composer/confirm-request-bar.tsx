import * as React from 'react';

import { copy } from '@/strings';
import { ConfirmBody, type DialogResponder } from '@/dialogs/confirm-body';
import { confirmPromptLine } from '@/dialogs/confirm-prompt-line';
import type { PendingDialog } from '@/live/store';

type ConfirmRequestBarProps = {
  dialog: PendingDialog
  /** 其余待答数（多条时逐条应答——本条之后还有多少） */
  remaining: number
} & DialogResponder;

/**
 * 输入区内联确认条（Codex 式）：confirm 待答呈现随发起会话的输入卡走（非全局
 * 模态——切到其他会话自然不在场）。信息行 = 标题 + 统一工具提示（工具 + 目标一行，
 * truncate，title 悬停技术详情）+ 子代理来源 + 其余计数；应答回传约定沿用 ConfirmBody。
 */
function ConfirmRequestBar({ dialog, remaining, onRespond, onCancel }: ConfirmRequestBarProps) {
  const prompt = confirmPromptLine(dialog);
  return (
    <div className="flex flex-col gap-[8px] border-b border-border/60 bg-muted/50 px-4 py-[10px]">
      <div className="flex min-w-0 items-center gap-[8px]">
        <span className="shrink-0 text-[12.5px] leading-[18px] font-medium text-foreground">{copy.dialogs.confirmTitle}</span>
        {dialog.agentName !== undefined ? (
          <span className="shrink-0 text-[11.5px] leading-[17px] text-muted-foreground">{copy.dialogs.fromSubagent(dialog.agentName)}</span>
        ) : null}
        {prompt !== null ? (
          <span title={prompt.hover.length > 0 ? prompt.hover : undefined} className="min-w-0 flex-1 truncate font-mono text-[11.5px] leading-[17px] text-foreground/80">{prompt.text}</span>
        ) : null}
        {remaining > 0 ? (
          <span className="shrink-0 text-[11.5px] leading-[17px] text-muted-foreground">{copy.dialogs.morePending(remaining)}</span>
        ) : null}
      </div>
      <ConfirmBody dialog={dialog} onRespond={onRespond} onCancel={onCancel} />
    </div>
  );
}

export { ConfirmRequestBar };
