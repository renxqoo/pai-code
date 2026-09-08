import * as React from 'react';
import { BrainCircuit } from 'lucide-react';

import { copy } from '@/strings';
import { cn } from '@/lib/utils';

type ThinkingBlockProps = {
  id: string;
  text: string;
};

/** 思考过程块：仅在过程展开时渲染（正文 + 弱化样式区别于正文），无独立开关。 */
function ThinkingBlock({ text }: ThinkingBlockProps) {
  if (text.length === 0) return null;
  return (
    <div className="flex flex-col gap-[10px]">
      <div className="flex w-fit items-center gap-[8px] text-muted-foreground">
        <BrainCircuit className="size-[14px] shrink-0" strokeWidth={1.75} />
        <span className="text-[12.5px] leading-[20px]">{copy.flow.thinking}</span>
      </div>
      <div className={cn('border-l border-border pl-[14px] text-[12.5px] leading-[21px] text-muted-foreground')}>
        <p className="whitespace-pre-wrap break-words">{text}</p>
      </div>
    </div>
  );
}

const ThinkingBlockMemo = React.memo(ThinkingBlock);
export { ThinkingBlockMemo as ThinkingBlock };
