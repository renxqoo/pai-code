import { ChevronToggle } from '@paiapp/ui';

type TurnStatusLineProps = {
  label: string
  /** 结束的轮次可整轮展开/收起，运行中的轮次只显示计时 */
  expandable: boolean
  open: boolean
  onToggle: () => void
}

/**
 * 轮次状态行：Working for / Worked for + 走表或冻结的耗时，
 * 过程整体开合的唯一开关；与正文的分隔只靠留白，不落横线。
 */
function TurnStatusLine({ label, expandable, open, onToggle }: TurnStatusLineProps) {
  if (!expandable) {
    return <p className="text-[13px] leading-[20px] text-muted-foreground">{label}</p>;
  }
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      className="-mx-[4px] flex cursor-pointer items-center gap-[6px] rounded-md px-[4px] py-[2px] text-left outline-none select-none hover:bg-accent/60 focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <span className="text-[13px] leading-[20px] text-muted-foreground">{label}</span>
      <ChevronToggle open={open} variant="disclose" className="opacity-70" />
    </button>
  );
}

export { TurnStatusLine };
