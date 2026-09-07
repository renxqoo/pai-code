import { copy } from '@/strings';
import type { PendingDialog } from '@/live/store';

export type DialogResponder = {
  onRespond: (requestId: string, payload: Record<string, unknown>) => void;
  onCancel: (requestId: string) => void;
};

/** confirm（权限确认等）：允许/拒绝；关闭即 cancelled（agent 不被卡死）。 */
export function ConfirmBody({ dialog, onRespond, onCancel }: { dialog: PendingDialog } & DialogResponder) {
  return (
    <div className="flex justify-end gap-[10px]">
      <button
        type="button"
        onClick={() => onCancel(dialog.requestId)}
        className="h-[32px] rounded-[8px] border border-border px-[14px] text-[12.5px] text-foreground/85 hover:bg-muted/60"
      >
        {copy.dialogs.deny}
      </button>
      <button
        type="button"
        onClick={() => onRespond(dialog.requestId, { confirmed: true })}
        className="h-[32px] rounded-[8px] bg-foreground px-[14px] text-[12.5px] font-medium text-background hover:bg-foreground/90"
      >
        {copy.dialogs.allow}
      </button>
    </div>
  );
}
