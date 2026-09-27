import * as React from 'react';

import { cn } from '@/lib/utils';
import { hunkLines } from './hunk-lines';
import type { EditHunkView } from '@paiapp/contracts';

type EditHunkListProps = {
  hunks: readonly EditHunkView[]
}

/**
 * 补丁片段列表：edit 工具「改了什么」的唯一出口——只展示变化的原文/新文对照，
 * 不是整个文件（模型要求 oldText 是最小改动面，片段本身就是改动面）。
 * 删除行红底、新增行绿底，片段间以细分隔断开；无片段不渲染（调用方按需占位）。
 */
function EditHunkList({ hunks }: EditHunkListProps) {
  if (hunks.length === 0) return null;
  return (
    <div className="flex flex-col gap-[6px]">
      {hunks.map((hunk, index) => (
        <div
          key={`${index}-${hunk.oldText.slice(0, 8)}`}
          className="overflow-hidden rounded-[6px] border border-border font-mono text-[11px] leading-[17px]"
        >
          {hunkLines(hunk, index).map((line) => (
            <div
              key={line.key}
              className={cn(
                'flex whitespace-pre-wrap break-words px-[8px] py-[1px]',
                line.tone === 'remove' && 'bg-diff-del/10 text-diff-del',
                line.tone === 'add' && 'bg-diff-add/10 text-diff-add',
                line.tone === 'plain' && 'text-muted-foreground/70',
              )}
            >
              <span aria-hidden="true" className="mr-[6px] shrink-0 opacity-70 select-none">
                {line.tone === 'add' ? '+' : line.tone === 'remove' ? '-' : ' '}
              </span>
              <span className="min-w-0">{line.text}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

export { EditHunkList };
