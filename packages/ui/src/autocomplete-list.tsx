import { cn } from 'cn'

export type AutocompleteItem = {
  id: string
  label: string
  description?: string | null
}

type AutocompleteListProps = {
  items: readonly AutocompleteItem[]
  /** 键盘高亮条目 id；null = 无高亮 */
  activeId: string | null
  onSelect: (id: string) => void
  /** 鼠标悬停同步高亮（防键盘/鼠标高亮打架） */
  onHover: (id: string) => void
  ariaLabel: string
  emptyLabel?: string
  className?: string
}

/**
 * 通用补全列表面板：不做绝对定位（由调用方包裹容器负责定位）。
 * 高亮统一由 activeId 驱动，鼠标悬停经 onHover 回流给调用方，避免键盘/鼠标高亮打架。
 */
function AutocompleteList({
  items,
  activeId,
  onSelect,
  onHover,
  ariaLabel,
  emptyLabel,
  className,
}: AutocompleteListProps) {
  if (items.length === 0 && emptyLabel === undefined) return null

  return (
    <div
      role="listbox"
      aria-label={ariaLabel}
      className={cn(
        'w-[320px] max-h-[220px] overflow-y-auto rounded-[10px] border border-border bg-background py-[4px] shadow-[0_10px_28px_-14px_rgba(24,24,28,0.4)]',
        className,
      )}
    >
      {items.length === 0 ? (
        <div className="px-[10px] py-[6px] text-[11.5px] text-muted-foreground">{emptyLabel}</div>
      ) : (
        items.map((item) => {
          const active = item.id === activeId
          return (
            <button
              key={item.id}
              type="button"
              role="option"
              aria-selected={active}
              onMouseEnter={() => onHover(item.id)}
              onClick={() => onSelect(item.id)}
              className={cn(
                'flex w-full cursor-pointer items-center gap-2 rounded-md px-2.5 py-1 text-left outline-none select-none focus-visible:ring-3 focus-visible:ring-ring/50',
                active && 'bg-accent/60',
              )}
            >
              <span className="min-w-0 truncate text-[12.5px] leading-5 text-foreground">{item.label}</span>
              {item.description ? (
                <span className="ml-auto max-w-[55%] shrink-0 truncate text-[11px] leading-5 text-muted-foreground/80">
                  {item.description}
                </span>
              ) : null}
            </button>
          )
        })
      )}
    </div>
  )
}

export { AutocompleteList }
export type { AutocompleteListProps }
