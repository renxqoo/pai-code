import * as React from 'react';
import { ChevronToggle } from '@paiapp/ui';
import { TextBlock } from '@/thread/text-block';
import { copy } from '@/strings';

type CompactionSummaryRowProps = {
  message: { id: string; text: string };
  /** 被折叠的历史轮数（mapEntries 折叠区间时的 splice 计数随标记携带） */
  foldedTurns: number;
};

/**
 * 压缩摘要行（CONTEXT-TOKEN-UNIFICATION §3.4 P5）：默认单行标记 + 展开箭头
 * （与 TurnStatusLine 同形态词汇——纯文字不放卡框）；点击展开后以 Markdown
 * 呈现摘要正文。压缩是断代不是事件——与 SystemMessageRow（task-notification
 * 居中卡）形态分化。
 */
function CompactionSummaryRow({ message, foldedTurns }: CompactionSummaryRowProps) {
  const [open, setOpen] = React.useState(false);
  const label = foldedTurns > 0 ? copy.flow.compactionSummaryLabel(foldedTurns) : copy.flow.compactionSummaryLabelNoCount;
  return (
    <div className="flex flex-col gap-[8px] py-[4px]">
      <button
        type="button"
        onClick={() => { setOpen((v) => !v); }}
        aria-expanded={open}
        className="-mx-[4px] flex cursor-pointer items-center gap-[6px] rounded-md px-[4px] py-[2px] text-left outline-none select-none hover:bg-accent/60 focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <span className="shrink-0 text-[12.5px] leading-[18px] text-muted-foreground">{label}</span>
        <ChevronToggle open={open} variant="disclose" className="opacity-70" />
      </button>
      {open ? <TextBlock text={message.text} /> : null}
    </div>
  );
}

export { CompactionSummaryRow };
