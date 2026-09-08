import type { ReactNode } from 'react'

import { cn } from 'cn'

type ChatBubbleProps = {
  children: ReactNode
  className?: string
}

/** 用户消息气泡：右侧对齐由调用方布局决定，这里只负责气泡本体。 */
function ChatBubble({ children, className }: ChatBubbleProps) {
  return (
    <div
      className={cn(
        'w-fit max-w-full rounded-[15px] bg-muted px-[10px] py-[12px] text-[13.5px] leading-[22px] tracking-[0.01em] text-foreground whitespace-pre-wrap',
        className,
      )}
    >
      {children}
    </div>
  )
}

export { ChatBubble }
export type { ChatBubbleProps }
