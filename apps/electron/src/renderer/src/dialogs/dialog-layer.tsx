import * as React from 'react';

import { copy } from '@/strings';
import type { PendingDialog } from '@/live/store';
import { ConfirmBody } from './confirm-body';

type DialogLayerProps = {
  dialogs: readonly PendingDialog[];
  onRespond: (requestId: string, payload: Record<string, unknown>) => void;
  onCancel: (requestId: string) => void;
};

/**
 * 对话框层：ui_request confirm 的模态呈现（host-hub 仅此一种形态）。
 * 应答永远回传（关闭即 cancelled——客户端约定，不让 agent 卡死）。
 */
function DialogLayer({ dialogs, onRespond, onCancel }: DialogLayerProps) {
  const current = dialogs[0];
  // Esc = 关闭即 cancelled（客户端约定）：对话框层是 Esc 的最终消费方
  React.useEffect(() => {
    if (current === undefined) return;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onCancel(current.requestId);
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [current?.requestId, onCancel]);
  if (current === undefined) return null;
  const rest = dialogs.length - 1;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/20 backdrop-blur-[2px]">
      <div className="w-[440px] rounded-[16px] border border-border bg-background p-[22px] shadow-[0_24px_48px_-16px_rgba(24,24,28,0.35)]">
        <p className="text-[13px] font-medium leading-[20px] text-foreground">{copy.dialogs.confirmTitle}</p>
        {current.agentName !== undefined ? (
          <p className="pt-[4px] text-[11.5px] leading-[17px] text-muted-foreground">
            {copy.dialogs.fromSubagent(current.agentName)}
          </p>
        ) : null}
        {current.tool !== undefined && current.tool.length > 0 ? (
          <p className="pt-[10px] font-mono text-[11.5px] leading-[17px] text-muted-foreground">{current.tool}</p>
        ) : null}
        {current.summary !== undefined && current.summary.length > 0 ? (
          <pre className="mt-[12px] max-h-[240px] overflow-auto whitespace-pre-wrap break-words rounded-[10px] bg-muted/60 p-[12px] font-mono text-[12px] leading-[19px] text-foreground/90">
            {current.summary}
          </pre>
        ) : null}
        {current.reason !== undefined && current.reason.length > 0 ? (
          <p className="pt-[10px] text-[11.5px] leading-[17px] text-muted-foreground">{current.reason}</p>
        ) : null}
        <div className="pt-[18px]">
          <ConfirmBody dialog={current} onRespond={onRespond} onCancel={onCancel} />
        </div>
        {rest > 0 ? <p className="pt-[14px] text-[11.5px] text-muted-foreground">{copy.dialogs.morePending(rest)}</p> : null}
      </div>
    </div>
  );
}

export { DialogLayer };
