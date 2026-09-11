import { GitGraph, RotateCw, X } from 'lucide-react';

import type { GitGraphCommit, GitGraphView } from '@paiapp/contracts';
import { Dialog, DialogContent, DialogTitle, IconButton } from '@paiapp/ui';

import { cn } from '@/lib/utils';
import { copy } from '@/strings';

import { buildGraphLayouts, laneCountOf } from './graph-layout';
import { GitGraphBodyStatus, type GraphBodyStatus } from './git-graph-status';
import { GitGraphRow } from './git-graph-row';
import { GitGraphTableHeader } from './git-graph-table-header';

type GitGraphDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** null + loading/failed 决定空态 */
  view: GitGraphView | null
  loading: boolean
  failed: boolean
  onRefresh: () => void
};

/** 表体呈现态：失败优先；无数据时 loading 态优先于 unavailable/empty。 */
type GraphBodyState =
  | { kind: 'status'; status: GraphBodyStatus }
  | { kind: 'ready'; commits: readonly GitGraphCommit[]; truncated: boolean };

function resolveBodyState(view: GitGraphView | null, loading: boolean, failed: boolean): GraphBodyState {
  if (failed) return { kind: 'status', status: 'unavailable' };
  if (view === null || !view.isRepo) {
    return loading ? { kind: 'status', status: 'loading' } : { kind: 'status', status: 'unavailable' };
  }
  if (view.commits.length === 0) {
    return loading ? { kind: 'status', status: 'loading' } : { kind: 'status', status: 'empty' };
  }
  return { kind: 'ready', commits: view.commits, truncated: view.truncated };
}

/** 「Git 图谱」弹窗：近全屏壳 + 标题栏 + 表头 + 可滚动泳道表体（纯展示，数据与回调全走 props）。 */
function GitGraphDialog({ open, onOpenChange, view, loading, failed, onRefresh }: GitGraphDialogProps) {
  const body = resolveBodyState(view, loading, failed);
  const layouts = body.kind === 'ready' ? buildGraphLayouts(body.commits) : [];
  /** 泳道间距须全表统一（逐行各异会错断跨行连边）：取全表最大泳道数定档。 */
  const laneCount =
    layouts.length === 0 ? 1 : Math.max(...layouts.map((layout) => laneCountOf(layout)));
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="h-[calc(100vh-20px)] w-[calc(100vw-20px)] max-w-none grid-rows-[auto_minmax(0,1fr)] gap-0 overflow-hidden rounded-xl p-0 sm:max-w-[calc(100vw-20px)]"
      >
        <div className="flex h-[52px] items-center justify-between border-b border-border bg-muted pr-3 pl-4">
          <div className="flex min-w-0 items-center gap-2">
            <GitGraph className="size-4 shrink-0 text-foreground" aria-hidden />
            <DialogTitle className="truncate text-[15px] font-semibold text-foreground">
              {copy.gitGraph.title}
            </DialogTitle>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <IconButton label={copy.gitGraph.refresh} onClick={onRefresh} disabled={loading}>
              <RotateCw
                className={cn('size-4', loading && 'animate-spin motion-reduce:animate-none')}
              />
            </IconButton>
            <IconButton label={copy.gitGraph.close} onClick={() => onOpenChange(false)}>
              <X className="size-4" />
            </IconButton>
          </div>
        </div>
        <div className="scroll-thin flex min-h-0 flex-col overflow-y-auto bg-surface-subtle">
          <GitGraphTableHeader />
          {body.kind === 'ready' ? (
            <div className="pb-2">
              {body.commits.map((commit, index) => {
                const layout = layouts[index];
                if (layout === undefined) return null;
                return (
                  <GitGraphRow
                    key={commit.hash}
                    commit={commit}
                    layout={layout}
                    laneCount={laneCount}
                    isLast={index === body.commits.length - 1}
                  />
                );
              })}
              {body.truncated && (
                <p className="py-3 text-center text-xs text-muted-foreground">
                  {copy.gitGraph.truncated(body.commits.length)}
                </p>
              )}
            </div>
          ) : (
            <GitGraphBodyStatus status={body.status} />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export { GitGraphDialog };
export type { GitGraphDialogProps };
