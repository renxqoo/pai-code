import * as React from 'react';

import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Input } from '@paiapp/ui';
import { copy } from '@/strings';

type CreateBranchDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** 源分支（当前分支；游离 HEAD 时调用方传 HEAD） */
  from: string
  /** 检出在途：输入与按钮禁用 */
  busy: boolean
  /** 失败原因文案（分支已存在/脏工作区等），null = 无错误 */
  error: string | null
  onSubmit: (branch: string) => void
}

/** 「创建并检出」小弹窗：输入新分支名 → git checkout -b。 */
function CreateBranchDialog({ open, onOpenChange, from, busy, error, onSubmit }: CreateBranchDialogProps) {
  const [name, setName] = React.useState('');
  // 每次打开重置输入（失败重开不残留上次的名字）
  React.useEffect(() => {
    if (open) setName('');
  }, [open]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[380px]">
        <DialogHeader>
          <DialogTitle>{copy.newTask.createBranchTitle(from)}</DialogTitle>
          <DialogDescription className="sr-only">{copy.newTask.createBranchSubmit}</DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const trimmed = name.trim();
            if (trimmed.length === 0 || busy) return;
            onSubmit(trimmed);
          }}
        >
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={copy.newTask.createBranchField}
            autoFocus
            disabled={busy}
            className="h-9"
          />
          {error === null ? null : <p className="pt-2 text-xs leading-[16px] text-destructive">{error}</p>}
          <DialogFooter className="-mx-4 mt-4 -mb-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
              {copy.dialogs.cancel}
            </Button>
            <Button type="submit" disabled={busy || name.trim().length === 0}>
              {copy.newTask.createBranchSubmit}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export { CreateBranchDialog };
export type { CreateBranchDialogProps };
