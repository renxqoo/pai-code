import * as React from 'react';
import { FileDiff } from 'lucide-react';

import { SplitButton } from '@paiapp/ui';

import { copy } from '@/strings';
import { formatDiffDelta } from './format-count-unit';
import type { DiffSummaryModel } from './thread-model';

type DiffBlockProps = {
  diff: DiffSummaryModel
  onOpenDiff: () => void
}

/** Diff 摘要块：变更文件数 + 绿/红增删量 + 文件列表 + Open diff 动作，无独立开关。 */
function DiffBlock({ diff, onOpenDiff }: DiffBlockProps) {
  return (
    <div className="rounded-[10px] border border-border">
      <div className="flex h-[54px] items-center gap-[9px] px-[11px]">
        <span className="shrink-0 text-[12.5px] leading-none font-medium text-foreground">
          {copy.flow.changedFiles(diff.changedFiles)}
        </span>
        <span className="shrink-0 font-mono text-[11px] leading-none tabular-nums text-diff-add">
          {formatDiffDelta('add', diff.additions)}
        </span>
        <span className="shrink-0 font-mono text-[11px] leading-none tabular-nums text-diff-del">
          {formatDiffDelta('del', diff.deletions)}
        </span>
        <div className="ml-auto flex shrink-0 items-center">
          <SplitButton
            label={copy.flow.openDiff}
            icon={<FileDiff className="size-3" strokeWidth={1.75} />}
            onClick={onOpenDiff}
          />
        </div>
      </div>
      <ul className="border-t border-border px-[11px] py-[6px]">
        {diff.files.map((file) => (
          <li key={file.path} className="flex h-[24px] items-center gap-[10px] font-mono text-[11px] leading-none">
            <span className="min-w-0 flex-1 truncate text-muted-foreground">{file.path}</span>
            <span className="shrink-0 tabular-nums text-diff-add">{formatDiffDelta('add', file.additions)}</span>
            <span className="shrink-0 tabular-nums text-diff-del">{formatDiffDelta('del', file.deletions)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const DiffBlockMemo = React.memo(DiffBlock);
export { DiffBlockMemo as DiffBlock };
