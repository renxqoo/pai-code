import { ArrowDown } from 'lucide-react';

import { copy } from '@/strings';

type ScrollToBottomButtonProps = {
  onClick: () => void
}

/** 回到底部浮标：消息流不在底部时浮现于列表右下，点击平滑滚到最新。 */
function ScrollToBottomButton({ onClick }: ScrollToBottomButtonProps) {
  return (
    <button
      type="button"
      aria-label={copy.flow.scrollToBottom}
      title={copy.flow.scrollToBottom}
      onClick={onClick}
      className="absolute right-[28px] bottom-[14px] z-10 flex size-[32px] cursor-pointer items-center justify-center rounded-full border border-border bg-background text-muted-foreground shadow-[0_6px_16px_-6px_rgba(24,24,28,0.28)] outline-none transition-colors select-none hover:bg-accent hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <ArrowDown className="size-[15px]" strokeWidth={2} />
    </button>
  );
}

export { ScrollToBottomButton };
