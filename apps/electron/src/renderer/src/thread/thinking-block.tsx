import { BrainCircuit } from 'lucide-react';

import { copy } from '@/strings';
import { cn } from '@/lib/utils';
import { ChevronToggle } from '@paiapp/ui';

type ThinkingBlockProps = {
  id: string;
  text: string;
  open: boolean;
  onToggle: () => void;
};

/** 思考过程块：默认折叠为摘要行，展开显示推理正文（弱化样式区别于正文）。 */
function ThinkingBlock({ text, open, onToggle }: ThinkingBlockProps) {
  if (text.length === 0) return null;
  return (
    <div className="flex flex-col gap-[10px]">
      <button type="button" onClick={onToggle} className="flex w-fit items-center gap-[8px] text-muted-foreground">
        <ChevronToggle open={open} />
        <BrainCircuit className="size-[14px] shrink-0" strokeWidth={1.75} />
        <span className="text-[12.5px] leading-[20px]">{copy.flow.thinking}</span>
      </button>
      {open ? (
        <div className={cn('border-l border-border pl-[14px] text-[12.5px] leading-[21px] text-muted-foreground')}>
          <p className="whitespace-pre-wrap break-words">{text}</p>
        </div>
      ) : null}
    </div>
  );
}

export { ThinkingBlock };
