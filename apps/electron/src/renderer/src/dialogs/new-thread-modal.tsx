import * as React from 'react';

import { copy } from '@/strings';

type NewThreadModalProps = {
  open: boolean;
  defaultCwd: string;
  trustedLabel: string;
  trustedHint: string;
  onClose: () => void;
  onCreate: (cwd: string, trusted: boolean) => Promise<boolean>;
};

/** 新会话：输入工作目录（thread/start.cwd）+ 受信开关（trusted=false 时不加载项目扩展）。 */
function NewThreadModal({ open, defaultCwd, trustedLabel, trustedHint, onClose, onCreate }: NewThreadModalProps) {
  const [cwd, setCwd] = React.useState(defaultCwd);
  const [trusted, setTrusted] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open) {
      setCwd(defaultCwd);
      setTrusted(false);
      setError(null);
    }
  }, [open, defaultCwd]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/20 backdrop-blur-[2px]">
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          if (cwd.trim().length === 0) return;
          setBusy(true);
          setError(null);
          const ok = await onCreate(cwd.trim(), trusted);
          setBusy(false);
          if (ok) onClose();
        }}
        className="w-[440px] rounded-[16px] border border-border bg-background p-[22px] shadow-[0_24px_48px_-16px_rgba(24,24,28,0.35)]"
      >
        <p className="text-[13px] font-medium leading-[20px]">{copy.newThread.title}</p>
        <p className="pt-[6px] text-[12px] leading-[18px] text-muted-foreground">{copy.newThread.hint}</p>
        <input
          value={cwd}
          onChange={(event) => setCwd(event.target.value)}
          placeholder={copy.newThread.fieldCwd}
          autoFocus
          className="mt-[14px] h-[34px] w-full rounded-[10px] border border-border bg-background px-[12px] font-mono text-[12px] outline-none focus:border-foreground/25"
        />
        <label className="mt-[10px] flex w-fit cursor-pointer items-center gap-[8px] select-none">
          <input
            type="checkbox"
            checked={trusted}
            onChange={(event) => setTrusted(event.target.checked)}
            disabled={busy}
            className="size-[14px] shrink-0 cursor-pointer accent-foreground disabled:cursor-not-allowed disabled:opacity-60"
          />
          <span className="text-[12px] leading-[16px] text-foreground/85">{trustedLabel}</span>
        </label>
        <p className="mt-[4px] text-[11px] leading-[16px] text-muted-foreground">{trustedHint}</p>
        {error !== null ? <p className="pt-[8px] text-[11.5px] text-red-600">{error}</p> : null}
        <div className="flex justify-end gap-[10px] pt-[18px]">
          <button type="button" onClick={onClose} className="h-[32px] rounded-[8px] border border-border px-[14px] text-[12.5px] text-foreground/85 hover:bg-muted/60">
            {copy.dialogs.cancel}
          </button>
          <button type="submit" disabled={busy} className="h-[32px] rounded-[8px] bg-foreground px-[14px] text-[12.5px] font-medium text-background hover:bg-foreground/90 disabled:opacity-60">
            {copy.newThread.create}
          </button>
        </div>
      </form>
    </div>
  );
}

export { NewThreadModal };
