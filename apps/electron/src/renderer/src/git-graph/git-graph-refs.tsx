import { GitBranch } from 'lucide-react';

import { cn } from '@/lib/utils';
import { copy } from '@/strings';

type GitGraphRefsProps = {
  /** refs token（「HEAD -> main」形态原样透传，此处拆 pill） */
  refs: readonly string[];
  className?: string
};

const HEAD_TOKEN = 'HEAD';

/** refs 装饰 pill 组：HEAD 橙色 pill、普通分支灰色 pill；「HEAD -> main」按「 -> 」拆开（refname 禁空格，带空格的分隔串不可能出现在分支名内）。 */
function GitGraphRefs({ refs, className }: GitGraphRefsProps) {
  const tokens = refs
    .flatMap((ref) => ref.split(' -> '))
    .map((token) => token.trim())
    .filter((token) => token.length > 0);
  if (tokens.length === 0) return null;
  return (
    <span className={cn('flex shrink-0 items-center gap-[6px]', className)}>
      {tokens.map((token, index) => {
        const isHead = token === HEAD_TOKEN;
        return (
          <span
            key={`${token}-${index}`}
            className={cn(
              'inline-flex h-[22px] shrink-0 items-center gap-[5px] rounded-md border px-[7px] text-[12px] leading-none font-medium',
              isHead
                ? 'border-orange-500/60 bg-orange-500/[0.07] text-orange-600 dark:border-orange-400/50 dark:bg-orange-400/10 dark:text-orange-400'
                : 'border-border bg-popover text-muted-foreground',
            )}
          >
            <GitBranch className="size-3 shrink-0" aria-hidden />
            {isHead ? copy.gitGraph.headLabel : token}
          </span>
        );
      })}
    </span>
  );
}

export { GitGraphRefs };
export type { GitGraphRefsProps };
