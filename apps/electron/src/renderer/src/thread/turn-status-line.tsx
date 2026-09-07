import { ChevronToggle } from '@paiapp/ui';

type TurnStatusLineProps = {
  label: string
  /** 结束的轮次可整轮展开/收起，运行中的轮次只显示计时 */
  expandable: boolean
  open: boolean
  onToggle: () => void
}

/** 轮次状态行：Working for / Worked for + 走表或冻结的耗时，下缘与正文以细线分隔。 */
function TurnStatusLine({ label, expandable, open, onToggle }: TurnStatusLineProps) {
  return (
    <div>
      {expandable ? (
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          className="-mx-[4px] flex cursor-pointer items-center gap-[6px] rounded-md px-[4px] py-[2px] text-left outline-none select-none hover:bg-accent/60 focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <span className="text-[13px] leading-[20px] text-muted-foreground">{label}</span>
          <ChevronToggle open={open} variant="disclose" className="opacity-70" />
        </button>
      ) : (
        <p className="text-[13px] leading-[20px] text-muted-foreground">{label}</p>
      )}
      <div aria-hidden="true" className="mt-[18px] h-px w-full bg-border" />
    </div>
  );
}

export { TurnStatusLine };
