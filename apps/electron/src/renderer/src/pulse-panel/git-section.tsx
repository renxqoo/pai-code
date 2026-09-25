import * as React from 'react';
import { ArrowUpDown, FileDiff, FolderGit2, GitGraph } from 'lucide-react';

import type { GitBranchesView, GitStatusView } from '@paiapp/contracts';

import { DiffStat, Spinner } from '@paiapp/ui';
import { GitGraphDialog } from '@/git-graph/git-graph-dialog';
import { useGitGraph } from '@/hooks/use-git-graph';
import { workspaceActions } from '@/live/workspace-runtime';
import { copy } from '@/strings';

import { BranchMenu } from './branch-menu';

type GitSectionProps = {
  /** 工作区变更速览（null = 加载中/未取到） */
  status: GitStatusView | null
  loading: boolean
  failed: boolean
  onRetry: () => void
  cwd: string
  /** 分支视图（BranchMenu 下拉数据源） */
  branches: GitBranchesView | null
  branchesLoading: boolean
  branchesFailed: boolean
  branchLocked: boolean
  /** 分支失效代次（checkout 成功递增，图谱随之重拉） */
  branchRevision: number
  onOpenDiff: () => void
};

const ROW_CLASS = 'flex h-8 w-full items-center gap-2 rounded-lg px-1.5 text-left outline-none select-none';
const BUTTON_ROW_CLASS = `${ROW_CLASS} cursor-pointer hover:bg-accent/50 focus-visible:ring-3 focus-visible:ring-ring/50`;

/** Git 分区（速览面板）：更改行（→Diff 面板）/ 分支下拉 / 上游计数 / 图谱入口。 */
function GitSection(props: GitSectionProps): React.JSX.Element {
  const [graphOpen, setGraphOpen] = React.useState(false);
  const graph = useGitGraph(props.cwd, workspaceActions.listGitGraph, props.branchRevision, graphOpen);
  const view = props.status;

  if (props.failed) {
    return (
      <div className={ROW_CLASS}>
        <FolderGit2 aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" strokeWidth={1.75} />
        <span className="min-w-0 flex-1 truncate text-[12px] text-muted-foreground">{copy.pulse.git.unavailable}</span>
        <button
          type="button"
          onClick={props.onRetry}
          className="shrink-0 cursor-pointer rounded-md px-1.5 py-0.5 text-[11px] text-foreground outline-none hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {copy.pulse.git.retry}
        </button>
      </div>
    );
  }
  if (view === null) {
    return (
      <div className={ROW_CLASS}>
        <Spinner className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate text-[12px] text-muted-foreground">{copy.panel.file.loading}</span>
      </div>
    );
  }
  if (!view.isRepo) {
    return (
      <div className={ROW_CLASS}>
        <FolderGit2 aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" strokeWidth={1.75} />
        <span className="min-w-0 flex-1 truncate text-[12px] text-muted-foreground">{copy.pulse.git.notRepo}</span>
      </div>
    );
  }
  return (
    <>
      <button
        type="button"
        onClick={props.onOpenDiff}
        aria-label={copy.pulse.git.changesAria(view.fileCount)}
        title={copy.flow.changedFiles(view.fileCount)}
        className={BUTTON_ROW_CLASS}
      >
        <FileDiff aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" strokeWidth={1.75} />
        <span className="min-w-0 flex-1 truncate text-[12px] text-foreground">{copy.pulse.git.changes}</span>
        <DiffStat additions={view.additions} deletions={view.deletions} />
      </button>
      <BranchMenu
        view={props.branches}
        current={view.current}
        loading={props.branchesLoading}
        failed={props.branchesFailed}
        cwd={props.cwd}
        locked={props.branchLocked}
        onOpenGraph={() => setGraphOpen(true)}
      />
      {(view.ahead > 0 || view.behind > 0) && (
        <div className={ROW_CLASS}>
          <ArrowUpDown aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" strokeWidth={1.75} />
          <span className="min-w-0 flex-1 truncate text-[12px] text-muted-foreground">{copy.pulse.git.upstream(view.ahead, view.behind)}</span>
        </div>
      )}
      <button type="button" onClick={() => setGraphOpen(true)} className={BUTTON_ROW_CLASS}>
        <GitGraph aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" strokeWidth={1.75} />
        <span className="min-w-0 flex-1 truncate text-[12px] text-foreground">{copy.pulse.git.graph}</span>
      </button>
      <GitGraphDialog open={graphOpen} onOpenChange={setGraphOpen} view={graph.view} loading={graph.loading} failed={graph.failed} onRefresh={graph.refresh} />
    </>
  );
}

export { GitSection };
export type { GitSectionProps };
