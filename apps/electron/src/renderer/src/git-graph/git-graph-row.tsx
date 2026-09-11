import { GitMerge } from 'lucide-react';

import type { GitGraphCommit } from '@paiapp/contracts';

import { cn } from '@/lib/utils';

import { GIT_GRAPH_GRID_COLS } from './git-graph-columns';
import { formatGitGraphDate } from './git-graph-date';
import { GitGraphLaneCell } from './git-graph-lane-cell';
import { laneColor } from './git-graph-lane-palette';
import { GitGraphRefs } from './git-graph-refs';
import type { GraphRowLayout } from './graph-model';

type GitGraphRowProps = {
  commit: GitGraphCommit
  layout: GraphRowLayout
  /** 本行已占泳道数，透传给泳道 SVG */
  laneCount: number
  /** 是否末行（末行连边不再伸向下一位） */
  isLast: boolean
};

/** merge 行行尾标记：取第一条跨泳道连边的目标泳道色（合入支线），无跨线则用本行泳道色。 */
function mergeIconTone(layout: GraphRowLayout): string {
  const crossEdge = layout.edges.find((edge) => edge.fromLane !== edge.toLane);
  return laneColor(crossEdge === undefined ? layout.lane : crossEdge.toLane).text;
}

/** 图谱单行：泳道 SVG | 描述（refs pill + 提交信息 + merge 标记）| 日期 | 作者 | 短哈希。 */
function GitGraphRow({ commit, layout, laneCount, isLast }: GitGraphRowProps) {
  const isMerge = commit.parents.length > 1;
  return (
    <div
      className={cn(
        GIT_GRAPH_GRID_COLS,
        'h-[58px]',
        commit.isHead ? 'bg-accent' : 'hover:bg-accent/60',
      )}
    >
      {/* 图列自持底色：HEAD/hover 高亮只覆盖内容列，与设计稿一致 */}
      <div className="relative border-r border-border bg-surface-subtle">
        <GitGraphLaneCell
          commit={commit}
          layout={layout}
          laneCount={laneCount}
          isLast={isLast}
          className="absolute top-0 left-0 z-10"
        />
      </div>
      <div className="flex min-w-0 items-center gap-2 pr-4 pl-4">
        <GitGraphRefs refs={commit.refs} />
        <span className="min-w-0 truncate text-[15px] text-foreground">{commit.subject}</span>
        {isMerge && <GitMerge className={cn('size-3.5 shrink-0', mergeIconTone(layout))} aria-hidden />}
      </div>
      <div className="flex items-center pl-4 text-[13px] whitespace-nowrap text-muted-foreground">
        {formatGitGraphDate(commit.timestamp)}
      </div>
      <div className="flex items-center overflow-hidden pl-4 text-[13px] whitespace-nowrap text-muted-foreground">
        {commit.author}
      </div>
      <div className="flex items-center pl-4 font-mono text-xs text-muted-foreground">
        {commit.shortHash}
      </div>
    </div>
  );
}

export { GitGraphRow };
export type { GitGraphRowProps };
