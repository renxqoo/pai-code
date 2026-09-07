import * as React from 'react';

import { cn } from '@/lib/utils';
import { copy } from '@/strings';
import type { PendingDialog } from '@/live/store';
import type { DialogResponder } from './confirm-body';

/** input/editor：文本应答（editor 为多行，prefill 预填）。 */
export function InputBody({ dialog, onRespond, onCancel }: { dialog: PendingDialog } & DialogResponder) {
  const [value, setValue] = React.useState(dialog.prefill ?? '');
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onRespond(dialog.requestId, { value });
      }}
      className="flex flex-col gap-[12px]"
    >
      <textarea
        value={value}
        placeholder={dialog.placeholder ?? ''}
        onChange={(event) => setValue(event.target.value)}
        rows={dialog.method === 'editor' ? 8 : 2}
        className={cn('w-full resize-none rounded-[10px] border border-border bg-background p-[12px] font-mono text-[12px] leading-[19px] outline-none focus:border-foreground/25')}
      />
      <div className="flex justify-end gap-[10px]">
        <button
          type="button"
          onClick={() => onCancel(dialog.requestId)}
          className="h-[32px] rounded-[8px] border border-border px-[14px] text-[12.5px] text-foreground/85 hover:bg-muted/60"
        >
          {copy.dialogs.cancel}
        </button>
        <button type="submit" className="h-[32px] rounded-[8px] bg-foreground px-[14px] text-[12.5px] font-medium text-background hover:bg-foreground/90">
          {copy.dialogs.send}
        </button>
      </div>
    </form>
  );
}
