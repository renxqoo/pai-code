import * as React from 'react';
import { BrainCircuit } from 'lucide-react';

import { ChevronToggle } from '@paiapp/ui';

import { copy } from '@/strings';
import { cn } from '@/lib/utils';
import { previewLine } from './preview-line';
import { resolveOpen, type CollapsePref } from './collapse-state';

type ThinkingBlockProps = {
  text: string;
  /** 轮次是否仍在走表：运行中流式展开并带脉冲点，结束后收起为单行摘要 */
  running: boolean;
};

/**
 * 思考单元：状态图标骑在过程组竖轨上，开合 = 手动意图优先，
 * 无意图时跟随轮次（运行中展开看流式推理，结束收起只留首行摘要）。
 */
function ThinkingBlock({ text, running }: ThinkingBlockProps) {
  const [pref, setPref] = React.useState<CollapsePref>(null);
  const open = resolveOpen(pref, running);
  if (text.length === 0) return null;
  return (
    <div className="flex flex-col">
      <div className="relative flex min-h-[24px] items-center">
        <span
          aria-hidden="true"
          className="absolute top-[3px] -left-[26px] flex h-[18px] w-[26px] shrink-0 items-center justify-center bg-background"
        >
          <BrainCircuit className="size-[13px] shrink-0 text-muted-foreground" strokeWidth={1.75} />
        </span>
        <button
          type="button"
          onClick={() => setPref(!open)}
          aria-expanded={open}
          className="flex min-w-0 flex-1 cursor-pointer items-center gap-[8px] rounded-md px-[6px] py-[2px] text-left outline-none select-none hover:bg-accent/60 focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <span className="shrink-0 text-[12.5px] leading-[20px] font-medium text-muted-foreground">
            {running ? copy.flow.thinking : copy.flow.thought}
          </span>
          {running ? (
            <span
              aria-hidden="true"
              className="size-[6px] shrink-0 animate-pulse rounded-full bg-dot-active motion-reduce:animate-none"
            />
          ) : null}
          {open ? null : (
            <span className="min-w-0 flex-1 truncate text-[12.5px] leading-[20px] text-meta-faint">
              {previewLine(text)}
            </span>
          )}
          <ChevronToggle open={open} className={cn('shrink-0 opacity-70', open && 'ml-auto')} />
        </button>
      </div>
      {open ? (
        <div className="mb-[4px] ml-[6px] border-l border-border py-[2px] pl-[14px] text-[12.5px] leading-[21px] text-muted-foreground">
          <p className="whitespace-pre-wrap break-words">{text}</p>
        </div>
      ) : null}
    </div>
  );
}

const ThinkingBlockMemo = React.memo(ThinkingBlock);
export { ThinkingBlockMemo as ThinkingBlock };
