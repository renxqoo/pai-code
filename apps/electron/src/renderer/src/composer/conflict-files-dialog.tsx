import * as React from 'react';
import { AlertTriangle } from 'lucide-react';

import { copy } from '@/strings';

type ConflictFilesDialogProps = {
  /** 会被覆盖的未提交文件（git 自身拒绝清单——D2' 试探式的真冲突面） */
  files: readonly string[]
  onClose: () => void
};

/**
 * 冲突确认弹窗（D2'，docs/GIT-INTERACTION-REDESIGN §1.3）：切换被未提交改动阻止时
 * 列出 git 拒绝覆盖的文件清单——知情裁决（提交/暂存/让会话中的 agent 代办），
 * 不提供强切（强切即丢改动）。轻量自管开合（调用方 null 即卸载）。
 */
function ConflictFilesDialog({ files, onClose }: ConflictFilesDialogProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6"
      role="dialog"
      aria-modal="true"
      aria-label={copy.branch.conflictTitle}
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-border bg-surface p-5 shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center gap-2">
          <AlertTriangle aria-hidden="true" className="size-4 shrink-0 text-amber-500" strokeWidth={1.75} />
          <h2 className="text-sm font-semibold text-foreground">{copy.branch.conflictTitle}</h2>
        </div>
        <p className="mt-2 text-xs leading-5 text-muted-foreground">{copy.branch.conflictFilesTitle(files.length)}</p>
        <ul className="mt-2 max-h-56 overflow-y-auto rounded-lg bg-muted px-3 py-2">
          {files.map((file) => (
            <li key={file} className="truncate py-0.5 font-mono text-xs text-foreground" title={file}>
              {file}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs leading-5 text-muted-foreground">{copy.branch.conflictHint}</p>
        <div className="mt-4 flex justify-end">
          <button
            type="button"
            autoFocus
            onClick={onClose}
            className="h-8 rounded-lg bg-primary px-4 text-xs font-medium text-primary-foreground outline-none hover:bg-primary/90 focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            {copy.gitGraph.close}
          </button>
        </div>
      </div>
    </div>
  );
}

export { ConflictFilesDialog };
