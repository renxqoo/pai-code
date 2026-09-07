import { FileDiff } from 'lucide-react';

import { ChevronToggle, SplitButton } from '@paiapp/ui';

import { copy } from '@/strings';
import { formatDiffDelta } from './format-count-unit';
import type { DiffSummaryModel } from './thread-model';

type DiffBlockProps = {
  diff: DiffSummaryModel
  open: boolean
  onToggle: () => void
  onOpenDiff: () => void
}

/** Diff 摘要块：变更文件数 + 绿/红增删量 + Show files，右侧 Open diff 动作。 */
function DiffBlock({ diff, open, onToggle, onOpenDiff }: DiffBlockProps) {
  return (
    <div className="rounded-[10px] border border-border">
      <div className="flex h-[54px] items-center gap-[9px] px-[11px]">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-label={open ? copy.flow.hideFiles : copy.flow.showFiles}
          className="flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground outline-none select-none hover:bg-accent hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <ChevronToggle open={open} variant="disclose" />
        </button>
        <span className="shrink-0 text-[12.5px] leading-none font-medium text-foreground">
          {copy.flow.changedFiles(diff.changedFiles)}
        </span>
        <span className="shrink-0 font-mono text-[12px] leading-none tabular-nums text-diff-add">
          {formatDiffDelta('add', diff.additions)}
        </span>
        <span className="shrink-0 font-mono text-[12px] leading-none tabular-nums text-diff-del">
          {formatDiffDelta('del', diff.deletions)}
        </span>
        <button
          type="button"
          onClick={onToggle}
          className="shrink-0 cursor-pointer rounded-md text-[12px] leading-none text-muted-foreground outline-none select-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {open ? copy.flow.hideFiles : copy.flow.showFiles}
        </button>
        <div className="ml-auto flex shrink-0 items-center">
          <SplitButton
            label={copy.flow.openDiff}
            icon={<FileDiff className="size-3" strokeWidth={1.75} />}
            onClick={onOpenDiff}
          />
        </div>
      </div>
      {open ? (
        <ul className="border-t border-border px-[11px] py-[6px]">
          {diff.files.map((file) => (
            <li key={file.path} className="flex h-[24px] items-center gap-[10px] font-mono text-[11px] leading-none">
              <span className="min-w-0 flex-1 truncate text-muted-foreground">{file.path}</span>
              <span className="shrink-0 tabular-nums text-diff-add">{formatDiffDelta('add', file.additions)}</span>
              <span className="shrink-0 tabular-nums text-diff-del">{formatDiffDelta('del', file.deletions)}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export { DiffBlock };
