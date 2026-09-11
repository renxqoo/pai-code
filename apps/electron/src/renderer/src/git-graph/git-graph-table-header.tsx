import { copy } from '@/strings';

import { cn } from '@/lib/utils';
import { GIT_GRAPH_GRID_COLS } from './git-graph-columns';

const HEADER_CELLS = [
  { key: 'graph', label: () => copy.gitGraph.colGraph, separated: false },
  { key: 'description', label: () => copy.gitGraph.colDescription, separated: true },
  { key: 'date', label: () => copy.gitGraph.colDate, separated: true },
  { key: 'author', label: () => copy.gitGraph.colAuthor, separated: true },
  { key: 'commit', label: () => copy.gitGraph.colCommit, separated: false },
] as const;

/** 图谱表头（表体滚动时吸附在滚动区顶部）：图 | 描述 | 日期 | 作者 | 提交；列间纵向分隔线只出现在表头，与设计稿一致。 */
function GitGraphTableHeader() {
  return (
    <div
      className={cn(
        GIT_GRAPH_GRID_COLS,
        'sticky top-0 z-20 h-12 border-b border-border bg-muted',
      )}
    >
      {HEADER_CELLS.map((cell) => (
        <div
          key={cell.key}
          className={cn(
            'flex items-center pl-4 text-[13px] text-muted-foreground',
            cell.separated && 'border-r border-border',
          )}
        >
          {cell.label()}
        </div>
      ))}
    </div>
  );
}

export { GitGraphTableHeader };
