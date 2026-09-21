import * as React from 'react';

import { copy } from '@/strings';
import { ConfirmBody, type DialogResponder } from '@/dialogs/confirm-body';
import type { PendingDialog } from '@/live/store';

type ConfirmRequestBarProps = {
  dialog: PendingDialog
  /** 其余待答数（多条时逐条应答——本条之后还有多少） */
  remaining: number
} & DialogResponder;

/**
 * 输入区内联确认条（Codex 式）：confirm 待答呈现随发起会话的输入卡走（非全局
 * 模态——切到其他会话自然不在场）。信息行 = 标题 + 工具 + 摘要（truncate，
 * title 悬停全文）+ 子代理来源 + 其余计数；应答回传约定沿用 ConfirmBody。
 */
function ConfirmRequestBar({ dialog, remaining, onRespond, onCancel }: ConfirmRequestBarProps) {
  return (
    <div className="flex flex-col gap-[8px] border-b border-border/60 bg-muted/50 px-4 py-[10px]">
      <div className="flex min-w-0 items-center gap-[8px]">
        <span className="shrink-0 text-[12.5px] leading-[18px] font-medium text-foreground">{copy.dialogs.confirmTitle}</span>
        {dialog.agentName !== undefined ? (
          <span className="shrink-0 text-[11.5px] leading-[17px] text-muted-foreground">{copy.dialogs.fromSubagent(dialog.agentName)}</span>
        ) : null}
        {dialog.tool !== undefined && dialog.tool.length > 0 ? (
          <span className="shrink-0 font-mono text-[11.5px] leading-[17px] text-muted-foreground">{dialog.tool}</span>
        ) : null}
        {dialog.summary !== undefined && dialog.summary.length > 0 ? (
          <span title={[dialog.summary, dialog.reason].filter(Boolean).join('\n')} className="min-w-0 flex-1 truncate font-mono text-[11.5px] leading-[17px] text-foreground/80">{dialog.summary}</span>
        ) : dialog.reason !== undefined && dialog.reason.length > 0 ? (
          <span title={dialog.reason} className="min-w-0 flex-1 truncate font-mono text-[11.5px] leading-[17px] text-foreground/80">{dialog.reason}</span>
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
