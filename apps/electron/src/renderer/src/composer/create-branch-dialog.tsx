import * as React from 'react';

import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Input } from '@paiapp/ui';
import { copy } from '@/strings';

const FIELD_ID = 'create-branch-name';
const HELPER_ID = 'create-branch-field-helper';
const ERROR_ID = 'create-branch-field-error';

type CreateBranchDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** 检出在途：输入与按钮禁用 */
  busy: boolean
  /** 失败原因文案（分支已存在/脏工作区等），null = 无错误 */
  error: string | null
  onSubmit: (branch: string) => void
}

/** 「创建并检出新分支」弹窗：输入新分支名，提交给调用方创建并检出。尺寸对齐选择弹窗族（sm:max-w-sm）。 */
function CreateBranchDialog({ open, onOpenChange, busy, error, onSubmit }: CreateBranchDialogProps) {
  const [name, setName] = React.useState('');
  // 每次打开重置输入（失败重开不残留上次的名字）
  React.useEffect(() => {
    if (open) setName('');
  }, [open]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{copy.branch.createTitle}</DialogTitle>
          <DialogDescription>{copy.branch.createSubtitle}</DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const trimmed = name.trim();
            if (trimmed.length === 0 || busy) return;
            onSubmit(trimmed);
          }}
        >
          <label htmlFor={FIELD_ID} className="block text-[13px] leading-none font-medium text-foreground">
            {copy.branch.createFieldLabel}
          </label>
          <Input
            id={FIELD_ID}
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={copy.branch.createFieldPlaceholder}
            autoFocus
            disabled={busy}
            aria-invalid={error !== null}
            aria-describedby={error === null ? HELPER_ID : `${HELPER_ID} ${ERROR_ID}`}
            className="mt-1.5 h-9"
          />
          <p id={HELPER_ID} className="mt-2 text-xs leading-4 text-muted-foreground">
            {copy.branch.createHelper}
          </p>
          {error === null ? null : (
            <p id={ERROR_ID} className="mt-2 text-xs leading-4 text-destructive">
              {error}
            </p>
          )}
          <DialogFooter className="mt-4 -mx-4 -mb-4">
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)} disabled={busy}>
              {copy.dialogs.cancel}
            </Button>
            <Button type="submit" disabled={busy || name.trim().length === 0}>
              {copy.branch.createSubmit}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export { CreateBranchDialog };
export type { CreateBranchDialogProps };
