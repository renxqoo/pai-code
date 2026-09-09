import { Search, X } from 'lucide-react';

import { cn } from '@/lib/utils';
import { copy } from '@/strings';

type SettingsSearchInputProps = {
  value: string
  onChange: (value: string) => void
  /** 占位文案，同时作为输入的无障碍名称 */
  placeholder: string
  className?: string
}

/** 搜索输入：放大镜 + 边框容器 + 有内容时的清除按钮；纯受控，过滤逻辑归调用方。 */
function SettingsSearchInput({ value, onChange, placeholder, className }: SettingsSearchInputProps) {
  return (
    <div
      className={cn(
        'flex h-9 items-center gap-2 rounded-lg border border-border bg-background px-3 outline-none focus-within:border-foreground/30',
        className,
      )}
    >
      <Search className="size-[14px] shrink-0 text-muted-foreground" strokeWidth={1.75} />
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        aria-label={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="h-full min-w-0 flex-1 bg-transparent text-[13px] leading-none text-foreground outline-none placeholder:text-muted-foreground"
      />
      {value.length > 0 ? (
        <button
          type="button"
          aria-label={copy.sidebar.clearSearch}
          onClick={() => onChange('')}
          className="flex size-[18px] shrink-0 cursor-pointer items-center justify-center rounded-full text-muted-foreground outline-none select-none hover:bg-accent hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <X className="size-[12px]" strokeWidth={2} />
        </button>
      ) : null}
    </div>
  );
}

export { SettingsSearchInput };
