import { ChevronToggle } from '@paiapp/ui';

import { cn } from '@/lib/utils';

type TurnStatusLineProps = {
  label: string
  /** 结束的轮次可整轮展开/收起；运行中的轮次只显示计时（计时文字带波纹加载态） */
  expandable: boolean
  open: boolean
  onToggle: () => void
}

/**
 * 轮次状态头：描边胶囊（Working for / Worked for + 走表或冻结的耗时），
 * 过程整体开合的唯一开关；与正文的分隔只靠留白，不落横线。
 */
function TurnStatusLine({ label, expandable, open, onToggle }: TurnStatusLineProps) {
  const pill =
    'inline-flex max-w-full items-center gap-[5px] rounded-[10px] border border-border bg-card px-[10px] py-[4px] text-[12.5px] leading-[18px] font-medium text-foreground/75';
  if (!expandable) {
    return (
      <span className={pill}>
        <span className="shimmer-text truncate">{label}</span>
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      className={cn(
        pill,
        'cursor-pointer text-left outline-none select-none hover:bg-accent/60 focus-visible:ring-3 focus-visible:ring-ring/50',
      )}
    >
      <span className="truncate">{label}</span>
      <ChevronToggle open={open} variant="disclose" className="shrink-0 opacity-60" />
    </button>
  );
}

export { TurnStatusLine };
