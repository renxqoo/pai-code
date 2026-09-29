import * as React from 'react';

import { cn } from '@/lib/utils';
import { copy } from '@/strings';

const FIELD_ID = 'create-branch-name';
const HELPER_ID = 'create-branch-field-helper';
const ERROR_ID = 'create-branch-field-error';

type CreateBranchDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** 创建在途：输入与按钮禁用 */
  busy: boolean
  /** 失败原因文案（分支已存在/脏工作区等），null = 无错误 */
  error: string | null
  /** 提交（分支名） */
  onSubmit: (branch: string) => void
}

/**
 * 「创建并检出新分支」弹窗：建分支并检出到当前工作区。
 * 轻量自管开合（与 conflict-files-dialog 同形态——ui Dialog 是 Portal 壳不进单测，
 * 本弹窗的表单行为必须可回归）；verb 失败内联呈现，改名重试不关窗；
 * Esc 自行消费关闭。
 */
function CreateBranchDialog({ open, onOpenChange, busy, error, onSubmit }: CreateBranchDialogProps) {
  const [name, setName] = React.useState('');
  // 每次打开重置输入（失败重开不残留上次的名字）
  React.useEffect(() => {
    if (open) setName('');
  }, [open]);
  React.useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onOpenChange(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onOpenChange]);
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 isolate z-50 flex items-center justify-center bg-black/40 p-6"
      role="dialog"
      aria-modal="true"
      aria-label={copy.branch.createTitle}
      onClick={() => onOpenChange(false)}
    >
      <div
        className="w-full max-w-sm rounded-2xl border border-border bg-popover p-5 shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 className="text-sm font-semibold text-foreground">{copy.branch.createTitle}</h2>
        <p className="mt-1.5 text-xs leading-4 text-muted-foreground">{copy.branch.createSubtitle}</p>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const trimmed = name.trim();
            if (trimmed.length === 0 || busy) return;
            onSubmit(trimmed);
          }}
        >
          <label htmlFor={FIELD_ID} className="mt-4 block text-[13px] leading-none font-medium text-foreground">
            {copy.branch.createFieldLabel}
          </label>
          <input
            id={FIELD_ID}
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={copy.branch.createFieldPlaceholder}
            autoFocus
            disabled={busy}
            autoComplete="off"
            spellCheck={false}
            aria-invalid={error !== null}
            aria-describedby={error === null ? HELPER_ID : `${HELPER_ID} ${ERROR_ID}`}
            className="mt-1.5 h-9 w-full rounded-md border border-border bg-transparent px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
          />
          <p id={HELPER_ID} className="mt-2 text-xs leading-4 text-muted-foreground">
            {copy.branch.createHelper}
          </p>
          {error === null ? null : (
            <p id={ERROR_ID} className="mt-2 text-xs leading-4 text-destructive">
              {error}
            </p>
          )}
          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              disabled={busy}
              className={cn(
                'h-8 cursor-pointer rounded-md border border-border px-3 text-xs text-foreground outline-none hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50',
                busy && 'cursor-not-allowed opacity-50',
              )}
              onClick={() => onOpenChange(false)}
            >
              {copy.dialogs.cancel}
            </button>
            <button
              type="submit"
              disabled={busy || name.trim().length === 0}
              className={cn(
                'h-8 cursor-pointer rounded-md bg-foreground px-3 text-xs text-background outline-none hover:bg-foreground/90 focus-visible:ring-3 focus-visible:ring-ring/50',
                (busy || name.trim().length === 0) && 'cursor-not-allowed opacity-50',
              )}
            >
              {copy.branch.createSubmit}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export { CreateBranchDialog };
export type { CreateBranchDialogProps };
