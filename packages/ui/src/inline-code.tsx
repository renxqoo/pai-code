import { cn } from 'cn'

type InlineCodeProps = {
  children: string
  className?: string
}

/** 行内代码胶囊：等宽 + 浅底细边，正文段落内的代码片段样式。 */
function InlineCode({ children, className }: InlineCodeProps) {
  return (
    <code
      className={cn(
        'mx-[1px] inline-block max-w-full truncate rounded-[5px] border border-border bg-surface-subtle px-[5px] py-[1.5px] align-baseline font-mono text-[11px] leading-[16px] text-foreground/85',
        className,
      )}
    >
      {children}
    </code>
  )
}

export { InlineCode }
export type { InlineCodeProps }
