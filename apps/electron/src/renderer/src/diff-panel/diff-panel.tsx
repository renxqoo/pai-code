import * as React from 'react';

import { DiffFileList } from '@/thread/diff-file-list';
import { formatDiffDelta } from '@/thread/format-count-unit';
import { copy } from '@/strings';
import type { DiffSummaryModel } from '@/thread/thread-model';

type DiffPanelProps = {
  diff: DiffSummaryModel
}

/** Diff pane（面板容器提供标签行与外框）：会话级文件变更列表 + 底部总量汇总。 */
function DiffPanel({ diff }: DiffPanelProps) {
  return (
    <>
      {diff.files.length === 0 ? (
        <div className="flex flex-1 items-center justify-center px-[14px] pb-[10px]">
          <p className="text-[12px] leading-[19px] text-muted-foreground/80">{copy.flow.diffPanelEmpty}</p>
        </div>
      ) : (
        <>
          <div className="min-h-0 flex-1 overflow-y-auto px-[14px] pt-[2px] pb-[10px]">
            <DiffFileList files={diff.files} />
          </div>
          <div className="flex h-[30px] shrink-0 items-center gap-[12px] border-t border-border px-[14px]">
            <span className="text-[11px] leading-none text-muted-foreground">
              {copy.flow.changedFiles(diff.changedFiles)}
            </span>
            <span className="ml-auto shrink-0 font-mono text-[11px] leading-none tabular-nums text-diff-add">
              {formatDiffDelta('add', diff.additions)}
            </span>
            <span className="shrink-0 font-mono text-[11px] leading-none tabular-nums text-diff-del">
              {formatDiffDelta('del', diff.deletions)}
            </span>
          </div>
        </>
      )}
    </>
  );
}

const DiffPanelMemo = React.memo(DiffPanel);
export { DiffPanelMemo as DiffPanel };
