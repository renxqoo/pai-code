import { cn } from 'cn'

type MetaLineProps = {
  /** 元信息段：空段自动剔除，段间以中点分隔 */
  items: readonly string[]
  className?: string
}

/** 元信息行：等宽弱化文本，模型 / 档位 / token / 工具数一类的概要。 */
function MetaLine({ items, className }: MetaLineProps) {
  const parts = items.filter((item) => item.length > 0)
  if (parts.length === 0) return null
  return (
    <span className={cn('block truncate font-mono text-[11px] leading-none text-meta-faint', className)}>
      {parts.map((part, index) => (
        <span key={`${index}-${part}`}>
          {index > 0 ? <span className="px-[6px] opacity-80">·</span> : null}
          {part}
        </span>
      ))}
    </span>
  )
}

export { MetaLine }
export type { MetaLineProps }
