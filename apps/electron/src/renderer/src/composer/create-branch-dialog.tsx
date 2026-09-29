import * as React from 'react';

import { ToggleSwitch } from '@paiapp/ui';

import { cn } from '@/lib/utils';
import { copy } from '@/strings';

const FIELD_ID = 'create-branch-name';
const HELPER_ID = 'create-branch-field-helper';
const ERROR_ID = 'create-branch-field-error';

type CreateBranchDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** 创建在途：输入与开关、按钮禁用 */
  busy: boolean
  /** 失败原因文案（分支已存在/脏工作区等），null = 无错误 */
  error: string | null
  /** 「在独立 worktree 开始」开关的不可用原因（非 null = 开关禁用 + 该文案） */
  worktreeReason: string | null
  /** 提交（分支名；true = 在独立 worktree 目录中创建） */
  onSubmit: (branch: string, inWorktree: boolean) => void
}

/**
 * 「创建并检出新分支」弹窗（worktree 与否同一弹窗，开关分派）：开关关 = 建分支并检出
 * 到当前工作区；开关开 = 建分支并在独立 worktree 目录中开始（主工作区不动）。
 * 开关不可用态（已在树内/游离 HEAD/分支信息不可用）禁用 + 原因文案。
 * 轻量自管开合（与 worktree-clean-dialog / conflict-files-dialog 同形态——ui Dialog 是
 * Portal 壳不进单测，本弹窗的表单行为必须可回归）；verb 失败内联呈现，改名重试不关窗；
 * Esc 自行消费关闭。
 */
function CreateBranchDialog({ open, onOpenChange, busy, error, worktreeReason, onSubmit }: CreateBranchDialogProps) {
  const [name, setName] = React.useState('');
  const [inWorktree, setInWorktree] = React.useState(false);
  // 每次打开重置输入与开关（失败重开不残留上次的名字）
  React.useEffect(() => {
    if (open) {
      setName('');
      setInWorktree(false);
    }
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
  const worktreeOn = inWorktree && worktreeReason === null;
  return (
    <div
      className="fixed inset-0 isolate z-50 flex items-center justify-center bg-black/40 p-6"
      role="dialog"
      aria-modal="true"
      aria-label={worktreeOn ? copy.branch.wtStartInTreeTitle : copy.branch.createTitle}
      onClick={() => onOpenChange(false)}
    >
      <div
        className="w-full max-w-sm rounded-2xl border border-border bg-popover p-5 shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 className="text-sm font-semibold text-foreground">{worktreeOn ? copy.branch.wtStartInTreeTitle : copy.branch.createTitle}</h2>
        <p className="mt-1.5 text-xs leading-4 text-muted-foreground">{worktreeOn ? copy.branch.wtStartInTreeDesc : copy.branch.createSubtitle}</p>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const trimmed = name.trim();
            if (trimmed.length === 0 || busy) return;
            onSubmit(trimmed, worktreeOn);
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
          <div className="mt-3 flex items-center gap-2">
            <ToggleSwitch
              checked={worktreeOn}
              disabled={busy || worktreeReason !== null}
              onCheckedChange={setInWorktree}
              aria-label={copy.branch.wtStartInTree}
            />
            <span className={cn('text-xs leading-4', worktreeReason === null ? 'text-foreground' : 'text-muted-foreground')}>
              {copy.branch.wtStartInTree}
            </span>
          </div>
          {worktreeReason === null ? null : (
            <p className="mt-1 text-xs leading-4 text-muted-foreground">{worktreeReason}</p>
          )}
          <p id={HELPER_ID} className="mt-2 text-xs leading-4 text-muted-foreground">
            {worktreeOn ? copy.branch.wtStartInTreeDesc : copy.branch.createHelper}
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
              {worktreeOn ? copy.branch.wtStartSubmit : copy.branch.createSubmit}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export { CreateBranchDialog };
export type { CreateBranchDialogProps };
