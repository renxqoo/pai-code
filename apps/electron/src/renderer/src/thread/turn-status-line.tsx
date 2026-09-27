import { ChevronToggle } from '@paiapp/ui';

import { copy } from '@/strings';

type TurnStatusLineProps = {
  label: string
  /** 收起时展示的变更文件数（null = 本轮无变更，不挂后缀） */
  changedFiles?: number | null
  /** 结束的轮次可整轮展开/收起；运行中的轮次只显示计时（计时文字带波纹加载态） */
  expandable: boolean
  open: boolean
  onToggle: () => void
}

/**
 * 轮次状态行：Working for / Worked for + 走表或冻结的耗时，纯文字不落框，
 * 过程整体开合的唯一开关；与正文的分隔只靠留白，不落横线。
 * 箭头常显（不用行内 hover 显形）：轮级收起是常态，一行孤零零的
 * 「已工作 4m」若旁边什么都没有，用户看不出这行可点——它是整轮过程
 * 唯一的展开入口。行内小单元（执行行/思考行）才用 hover 显形。
 */
function TurnStatusLine({ label, changedFiles = null, expandable, open, onToggle }: TurnStatusLineProps) {
  if (!expandable) {
    return (
      <p className="text-[13.5px] leading-[21px]">
        <span className="shimmer-text">{label}</span>
      </p>
    );
  }
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      className="-mx-[4px] flex cursor-pointer items-center gap-[6px] rounded-md px-[4px] py-[2px] text-left outline-none select-none hover:bg-accent/60 focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <span className="shrink-0 text-[13.5px] leading-[21px] text-muted-foreground">{label}</span>
      {changedFiles !== null ? (
        <span className="shrink-0 text-[12px] leading-[21px] text-muted-foreground/70">
          {copy.flow.turnChangedFiles(changedFiles)}
        </span>
      ) : null}
      <ChevronToggle open={open} variant="disclose" className="shrink-0 opacity-70" />
    </button>
  );
}

export { TurnStatusLine };
