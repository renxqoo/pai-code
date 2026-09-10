import * as React from 'react';
import { BrainCircuit } from 'lucide-react';

import { ChevronToggle, TickerText } from '@paiapp/ui';

import { copy } from '@/strings';
import { cn } from '@/lib/utils';
import { previewLine } from './preview-line';
import { thinkingParagraphs } from './thinking-paragraphs';
import { useStickToBottom } from './use-stick-to-bottom';
import { resolveOpen, type CollapsePref } from './collapse-state';

/** 跑马灯预览取用的文本上限：足够铺满任意行宽，又不让 DOM 节点失控 */
const TICKER_PREVIEW_CHARS = 240;

type ThinkingBlockProps = {
  text: string;
  /** 轮次是否仍在走表：驱动标签加载态、收起预览滚动与展开区贴底跟随 */
  running: boolean;
};

/**
 * 思考单元：展示开关只听用户手动（默认收起，展开与否完全由用户决定）。
 * 运行中：标签呈波纹加载态；收起时预览行以跑马灯滑动呈现流式输出；
 * 展开时正文限高滚动，流式追加期间贴底跟随最新推理，上翻即让位。
 */
function ThinkingBlock({ text, running }: ThinkingBlockProps) {
  const [pref, setPref] = React.useState<CollapsePref>(null);
  const open = resolveOpen(pref, false);
  const stick = useStickToBottom({ enabled: open && running });
  if (text.length === 0) return null;
  return (
    <div className="flex flex-col">
      <div className="relative flex min-h-[26px] items-center">
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
          className="flex min-w-0 flex-1 cursor-pointer items-center gap-[8px] rounded-md px-[6px] py-[3px] text-left outline-none select-none hover:bg-accent/60 focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <span
            className={cn(
              'shrink-0 text-[12.5px] leading-[20px] font-medium',
              running ? 'shimmer-text' : 'text-foreground/75',
            )}
          >
            {running ? copy.flow.thinking : copy.flow.thought}
          </span>
          {open ? null : (
            <TickerText
              active={running}
              text={previewLine(text, TICKER_PREVIEW_CHARS)}
              className="min-w-0 flex-1 text-[12.5px] leading-[20px] text-meta-faint"
            />
          )}
          <ChevronToggle open={open} className={cn('shrink-0 opacity-70', open && 'ml-auto')} />
        </button>
      </div>
      {open ? (
        <div
          ref={stick.containerRef}
          onScroll={stick.onScroll}
          className="scroll-thin mb-[4px] ml-[6px] flex max-h-[200px] flex-col gap-[6px] overflow-y-auto border-l border-border py-[2px] pl-[14px] text-[13px] leading-[21px] text-muted-foreground"
        >
          {thinkingParagraphs(text).map((paragraph, i) => (
            <p key={i} className="whitespace-pre-wrap break-words">
              {paragraph}
            </p>
          ))}
        </div>
      ) : null}
    </div>
  );
}

const ThinkingBlockMemo = React.memo(ThinkingBlock);
export { ThinkingBlockMemo as ThinkingBlock };
