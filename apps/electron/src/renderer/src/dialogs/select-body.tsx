import { copy } from '@/strings';
import type { PendingDialog } from '@/live/store';
import type { DialogResponder } from './confirm-body';

/** select：列表单选，选中即回 value。 */
export function SelectBody({ dialog, onRespond, onCancel }: { dialog: PendingDialog } & DialogResponder) {
  const options = dialog.options ?? [];
  return (
    <div className="flex max-h-[260px] flex-col gap-[6px] overflow-auto">
      {options.map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => onRespond(dialog.requestId, { value: option })}
          className="h-[32px] rounded-[8px] border border-border px-[12px] text-left text-[12.5px] hover:bg-muted/60"
        >
          {option}
        </button>
      ))}
      {options.length === 0 ? <p className="text-[12px] text-muted-foreground">{copy.dialogs.noOptions}</p> : null}
      <button type="button" onClick={() => onCancel(dialog.requestId)} className="mt-[6px] self-end text-[12px] text-muted-foreground hover:text-foreground">
        {copy.dialogs.cancel}
      </button>
    </div>
  );
}
