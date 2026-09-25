import { cn } from 'cn'

import { formatDiffDelta } from './format-count-unit'

type DiffStatProps = {
  additions: number
  deletions: number
  className?: string
}

/** Diff 增删计数（+N −M，等宽对齐）：0 值侧隐藏，全 0 渲染空槽（布局稳定）。 */
function DiffStat({ additions, deletions, className }: DiffStatProps) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 font-mono text-[11px] leading-none tabular-nums', className)}>
      {additions > 0 && <span className="text-diff-add">{formatDiffDelta('add', additions)}</span>}
      {deletions > 0 && <span className="text-diff-del">{formatDiffDelta('del', deletions)}</span>}
    </span>
  )
}

export { DiffStat }
export type { DiffStatProps }
