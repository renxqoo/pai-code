import * as React from 'react';

import { cn } from '@/lib/utils';
import { allHunkLines } from './hunk-lines';
import type { EditHunkView } from '@paiapp/contracts';

type EditHunkListProps = {
  hunks: readonly EditHunkView[]
}

/**
 * 补丁片段：edit 工具「改了什么」的唯一出口——只展示变化的原文/新文对照，
 * 不是整个文件（模型要求 oldText 是最小改动面，片段本身就是改动面）。
 *
 * **一个调用一个容器**（GitHub diff 形态）：一次编辑常含多段补丁，它们是同一处
 * 改动的几个片段，逐段套框会渲染成几个互不相干的方块——读起来像改了几个文件。
 * 多段在容器内堆叠，段间一条淡分隔线标出「这是另一处改动」；删除行红底、
 * 新增行绿底。整体可滚动，hunk 行数有上界时容器自己出滚动条。
 */
function EditHunkList({ hunks }: EditHunkListProps) {
  const lines = allHunkLines(hunks);
  if (lines.length === 0) return null;
  return (
    <div className="mb-[8px] overflow-hidden rounded-[8px] border border-border bg-surface-subtle font-mono text-[11px] leading-[17px]">
      <div className="max-h-[240px] overflow-auto">
        {lines.map((line) => (
          <div
            key={line.key}
            className={cn(
              'flex whitespace-pre-wrap break-words px-[10px] py-[1px]',
              line.tone === 'remove' && 'bg-diff-del/10 text-diff-del',
              line.tone === 'add' && 'bg-diff-add/10 text-diff-add',
              line.tone === 'plain' && 'text-muted-foreground/70',
              // 片段分界：下一段的首行上方一条淡线（同一次编辑里的另一处改动）
              line.startsHunk && 'border-t border-border/60 pt-[3px]',
            )}
          >
            <span aria-hidden="true" className="mr-[6px] shrink-0 opacity-70 select-none">
              {line.tone === 'add' ? '+' : line.tone === 'remove' ? '-' : ' '}
            </span>
            <span className="min-w-0">{line.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export { EditHunkList };
