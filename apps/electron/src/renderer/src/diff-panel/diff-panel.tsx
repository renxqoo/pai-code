import { X } from 'lucide-react';

import { IconButton } from '@paiapp/ui';

import { WINDOWS_CAPTION_WIDTH } from '@/lib/platform';
import { copy } from '@/strings';
import { formatDiffDelta } from '@/thread/format-count-unit';
import type { DiffSummaryModel } from '@/thread/thread-model';

type DiffPanelProps = {
  diff: DiffSummaryModel
  onClose: () => void
}

/** Diff 侧边栏：会话级文件变更列表（跨轮次聚合），底部总量汇总。 */
function DiffPanel({ diff, onClose }: DiffPanelProps) {
  return (
    <aside className="flex h-full w-[360px] shrink-0 flex-col border-l border-border bg-background">
      <div
        className="flex h-[46px] shrink-0 items-center justify-between pl-[14px]"
        style={{ paddingRight: WINDOWS_CAPTION_WIDTH + 14 }}
      >
        <h2 className="text-[10.5px] leading-none font-medium tracking-[0.08em] text-muted-foreground uppercase">
          {copy.flow.diffPanelTitle}
        </h2>
        <IconButton label={copy.flow.closeDiffPanel} size="sm" onClick={onClose} className="-mr-1">
          <X strokeWidth={1.75} />
        </IconButton>
      </div>
      {diff.files.length === 0 ? (
        <div className="flex flex-1 items-center justify-center px-[14px] pb-[10px]">
          <p className="text-[12px] leading-[19px] text-muted-foreground/80">{copy.flow.diffPanelEmpty}</p>
        </div>
      ) : (
        <>
          <div className="min-h-0 flex-1 overflow-y-auto px-[14px] pt-[2px] pb-[10px]">
            {diff.files.map((file) => (
              <div key={file.path} className="flex h-[24px] items-center gap-[10px] font-mono text-[11px] leading-none">
                <span className="min-w-0 flex-1 truncate text-muted-foreground" title={file.path}>
                  {file.path}
                </span>
                <span className="shrink-0 tabular-nums text-diff-add">{formatDiffDelta('add', file.additions)}</span>
                <span className="shrink-0 tabular-nums text-diff-del">{formatDiffDelta('del', file.deletions)}</span>
              </div>
            ))}
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
    </aside>
  );
}

export { DiffPanel };
