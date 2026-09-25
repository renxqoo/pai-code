import * as React from 'react';
import { FileDiff } from 'lucide-react';

import { ChevronToggle, formatDiffDelta, SplitButton } from '@paiapp/ui';

import { copy } from '@/strings';
import { DiffFileList } from './diff-file-list';
import type { DiffSummaryModel } from './thread-model';

type DiffBlockProps = {
  diff: DiffSummaryModel
  onOpenDiff: () => void
}

/**
 * Diff 摘要卡：变更文件数 + 绿/红增删量 + 文件明细 + Open diff 动作。
 * 明细默认收起（卡片常态只占一行），点标题开合；「打开 Diff」始终进侧栏面板。
 */
function DiffBlock({ diff, onOpenDiff }: DiffBlockProps) {
  const [open, setOpen] = React.useState(false);

  return (
    <div className="rounded-[10px] border border-border">
      <div className="flex h-[36px] items-center gap-[6px] pr-[8px] pl-[11px]">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          className="-ml-[5px] flex shrink-0 cursor-pointer items-center gap-[8px] rounded-[6px] px-[5px] py-[5px] text-left outline-none select-none hover:bg-accent/60 focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <span className="shrink-0 text-[12.5px] leading-none font-medium text-foreground">
            {copy.flow.changedFiles(diff.changedFiles)}
          </span>
          <span className="shrink-0 font-mono text-[11px] leading-none tabular-nums text-diff-add">
            {formatDiffDelta('add', diff.additions)}
          </span>
          <span className="shrink-0 font-mono text-[11px] leading-none tabular-nums text-diff-del">
            {formatDiffDelta('del', diff.deletions)}
          </span>
          <ChevronToggle open={open} className="shrink-0 opacity-70" />
        </button>
        <div className="ml-auto shrink-0">
          <SplitButton
            label={copy.flow.openDiff}
            icon={<FileDiff className="size-3" strokeWidth={1.75} />}
            onClick={onOpenDiff}
          />
        </div>
      </div>
      {open ? <DiffFileList files={diff.files} className="border-t border-border px-[11px] py-[6px]" /> : null}
    </div>
  );
}

const DiffBlockMemo = React.memo(DiffBlock);
export { DiffBlockMemo as DiffBlock };
