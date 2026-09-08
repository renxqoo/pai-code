import * as React from 'react';
import { FolderOpen } from 'lucide-react';

import { copy } from '@/strings';
import { baseNameOf } from '@/lib/project-dirs';

type NewThreadModalProps = {
  open: boolean;
  defaultCwd: string;
  /** 已知项目目录（最近优先；空数组时不渲染快捷行）。 */
  knownDirs: readonly string[];
  trustedLabel: string;
  trustedHint: string;
  onClose: () => void;
  onCreate: (cwd: string, trusted: boolean) => Promise<boolean>;
  /** 系统目录选择对话框；null = 取消。 */
  onPickDirectory: (defaultPath: string | null) => Promise<string | null>;
};

/** 新会话：工作目录（thread/start.cwd）手填 / 已知目录快捷选择 / 系统文件夹选择器；trusted=false 时不加载项目扩展。 */
function NewThreadModal({ open, defaultCwd, knownDirs, trustedLabel, trustedHint, onClose, onCreate, onPickDirectory }: NewThreadModalProps) {
  const [cwd, setCwd] = React.useState(defaultCwd);
  const [trusted, setTrusted] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [picking, setPicking] = React.useState(false);

  // 仅在打开瞬间重置（defaultCwd 异步回填不得覆盖打开后的用户输入/选择）
  React.useEffect(() => {
    if (open) {
      setCwd(defaultCwd);
      setTrusted(false);
      setBusy(false);
      setPicking(false);
    }
    // defaultCwd 只在打开时读取一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  const pickDirectory = async (): Promise<void> => {
    if (picking || busy) return;
    setPicking(true);
    try {
      const current = cwd.trim();
      const picked = await onPickDirectory(current.length > 0 ? current : null);
      if (picked !== null) setCwd(picked);
    } finally {
      setPicking(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/20 backdrop-blur-[2px]">
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          if (busy || picking) return;
          if (cwd.trim().length === 0) return;
          setBusy(true);
          const ok = await onCreate(cwd.trim(), trusted);
          setBusy(false);
          if (ok) onClose();
        }}
        className="w-[440px] rounded-[16px] border border-border bg-background p-[22px] shadow-[0_24px_48px_-16px_rgba(24,24,28,0.35)]"
      >
        <p className="text-[13px] font-medium leading-[20px]">{copy.newThread.title}</p>
        <p className="pt-[6px] text-[12px] leading-[18px] text-muted-foreground">{copy.newThread.hint}</p>
        <div className="mt-[14px] flex gap-[8px]">
          <input
            value={cwd}
            onChange={(event) => setCwd(event.target.value)}
            placeholder={copy.newThread.fieldCwd}
            autoFocus
            className="h-[34px] min-w-0 flex-1 rounded-[10px] border border-border bg-background px-[12px] font-mono text-[12px] outline-none focus:border-foreground/25"
          />
          <button
            type="button"
            onClick={() => void pickDirectory()}
            disabled={picking || busy}
            title={copy.newThread.browse}
            aria-label={copy.newThread.browse}
            className="flex h-[34px] w-[38px] shrink-0 cursor-pointer items-center justify-center rounded-[10px] border border-border text-muted-foreground outline-none select-none hover:bg-accent hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <FolderOpen className="size-[15px]" strokeWidth={1.75} />
          </button>
        </div>
        {knownDirs.length > 0 ? (
          <div aria-label={copy.newThread.knownDirs} className="mt-[8px] flex flex-wrap gap-[5px]">
            {knownDirs.map((dir) => (
              <button
                key={dir}
                type="button"
                title={dir}
                onClick={() => setCwd(dir)}
                className={`max-w-full cursor-pointer truncate rounded-[6px] border px-[8px] py-[3px] font-mono text-[11px] leading-[16px] outline-none select-none focus-visible:ring-2 focus-visible:ring-ring/50 ${
                  dir === cwd ? 'border-foreground/40 bg-muted/60 text-foreground' : 'border-border text-muted-foreground hover:bg-muted/40 hover:text-foreground'
                }`}
              >
                {baseNameOf(dir)}
              </button>
            ))}
          </div>
        ) : null}
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
        <div className="flex justify-end gap-[10px] pt-[18px]">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="h-[32px] rounded-[8px] border border-border px-[14px] text-[12.5px] text-foreground/85 hover:bg-muted/60 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {copy.dialogs.cancel}
          </button>
          <button
            type="submit"
            disabled={busy || picking}
            className="h-[32px] rounded-[8px] bg-foreground px-[14px] text-[12.5px] font-medium text-background hover:bg-foreground/90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {copy.newThread.create}
          </button>
        </div>
      </form>
    </div>
  );
}

export { NewThreadModal };
