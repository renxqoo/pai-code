import * as React from 'react';
import { Search, X } from 'lucide-react';

import { IconButton } from '@paiapp/ui';

import { copy } from '@/strings';

type SidebarSearchInputProps = {
  query: string
  /** 聚焦信号：token 变化重新聚焦（⌘K/快捷行在已展开态可再次唤起焦点）。 */
  focusToken: number
  onQueryChange: (value: string) => void
  /** 收起搜索行（父级同时清空查询并关闭展开态）。 */
  onClose: () => void
}

/** 侧栏内联搜索输入：Esc 收起并清空；stopPropagation 不外溢全局 Esc 语义。 */
function SidebarSearchInput({ query, focusToken, onQueryChange, onClose }: SidebarSearchInputProps) {
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  React.useEffect(() => {
    inputRef.current?.focus();
  }, [focusToken]);
  return (
    <div className="flex h-8 items-center gap-2 rounded-[8px] bg-accent px-2.5 focus-within:ring-3 focus-within:ring-ring/50">
      <Search className="size-[14px] shrink-0 text-muted-foreground/80" strokeWidth={1.75} />
      <input
        ref={inputRef}
        type="text"
        value={query}
        placeholder={copy.sidebar.search}
        aria-label={copy.sidebar.search}
        onChange={(event) => onQueryChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.stopPropagation();
            onQueryChange('');
            onClose();
          }
        }}
        className="h-full min-w-0 flex-1 bg-transparent text-[12.5px] leading-none text-foreground outline-none placeholder:text-muted-foreground/80"
      />
      {query.length > 0 ? (
        <IconButton
          label={copy.sidebar.clearSearch}
          size="xs"
          onClick={() => onQueryChange('')}
          className="text-muted-foreground/80"
        >
          <X strokeWidth={1.75} />
        </IconButton>
      ) : null}
    </div>
  );
}

export { SidebarSearchInput };
