import { cn } from 'cn'

export type SegmentedControlOption<T extends string> = {
  value: T
  label: string
}

type SegmentedControlProps<T extends string> = {
  options: readonly SegmentedControlOption<T>[]
  value: T
  onChange: (value: T) => void
  /** 无障碍名称（radiogroup 语义必填） */
  'aria-label': string
  className?: string
}

/** 分段控件（受控单选）：胶囊容器内互斥段，选中段反色填充；选项文案随渲染取当前 locale。 */
function SegmentedControl<T extends string>({ options, value, onChange, className, 'aria-label': ariaLabel }: SegmentedControlProps<T>) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className={cn('inline-flex items-center rounded-lg border border-border p-[3px]', className)}>
      {options.map((option) => {
        const selected = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(option.value)}
            className={cn(
              'flex h-[26px] cursor-pointer items-center whitespace-nowrap rounded-[7px] px-3 text-[12px] leading-none font-medium outline-none select-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 motion-reduce:transition-none',
              selected ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

export { SegmentedControl }
export type { SegmentedControlProps }
