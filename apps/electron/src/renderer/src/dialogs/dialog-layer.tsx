import * as React from 'react';

import { copy } from '@/strings';
import type { PendingDialog } from '@/live/store';
import { ConfirmBody } from './confirm-body';
import { InputBody } from './input-body';
import { SelectBody } from './select-body';

type DialogLayerProps = {
  dialogs: readonly PendingDialog[];
  onRespond: (requestId: string, payload: Record<string, unknown>) => void;
  onCancel: (requestId: string) => void;
};

/**
 * 对话框层：ui_request 的模态呈现（confirm/select/input/editor）。
 * 应答永远回传（关闭即 cancelled——api.md 客户端约定，不让 agent 卡死）。
 */
function DialogLayer({ dialogs, onRespond, onCancel }: DialogLayerProps) {
  const current = dialogs[0];
  // Esc = 关闭即 cancelled（api.md 客户端约定）：对话框层是 Esc 的最终消费方
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
        <p className="text-[13px] font-medium leading-[20px] text-foreground">{current.title ?? dialogTitle(current.method)}</p>
        {current.subagentId !== undefined ? (
          <p className="pt-[4px] text-[11.5px] leading-[17px] text-muted-foreground">
            {copy.dialogs.fromSubagent(current.agent ?? current.subagentId)}
          </p>
        ) : null}
        {current.message !== undefined && current.message.length > 0 ? (
          <pre className="mt-[12px] max-h-[240px] overflow-auto whitespace-pre-wrap break-words rounded-[10px] bg-muted/60 p-[12px] font-mono text-[12px] leading-[19px] text-foreground/90">
            {current.message}
          </pre>
        ) : null}
        <div className="pt-[18px]">
          {current.method === 'select' ? (
            <SelectBody dialog={current} onRespond={onRespond} onCancel={onCancel} />
          ) : current.method === 'input' || current.method === 'editor' ? (
            <InputBody dialog={current} onRespond={onRespond} onCancel={onCancel} />
          ) : (
            <ConfirmBody dialog={current} onRespond={onRespond} onCancel={onCancel} />
          )}
        </div>
        {rest > 0 ? <p className="pt-[14px] text-[11.5px] text-muted-foreground">{copy.dialogs.morePending(rest)}</p> : null}
      </div>
    </div>
  );
}

function dialogTitle(method: string): string {
  if (method === 'select') return copy.dialogs.selectTitle;
  if (method === 'input' || method === 'editor') return copy.dialogs.inputTitle;
  return copy.dialogs.confirmTitle;
}

export { DialogLayer };
