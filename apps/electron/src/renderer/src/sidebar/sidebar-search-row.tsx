import { Search, SquarePen, X } from 'lucide-react';

import { IconButton } from '@paiapp/ui';

type SidebarSearchRowProps = {
  searchLabel: string
  newThreadLabel: string
  clearLabel: string
  query: string
  onQueryChange: (value: string) => void
  onNewThread: () => void
}

/** 搜索行：左侧搜索输入（Esc 清空且不外溢全局停止语义）+ 右侧新建会话。 */
function SidebarSearchRow({ searchLabel, newThreadLabel, clearLabel, query, onQueryChange, onNewThread }: SidebarSearchRowProps) {
  return (
    <div className="flex h-9 items-center">
      <div className="flex h-full min-w-0 flex-1 items-center gap-2 rounded-lg px-2 focus-within:ring-3 focus-within:ring-ring/50">
        <Search className="size-4 shrink-0 text-muted-foreground/70" strokeWidth={1.75} />
        <input
          type="text"
          value={query}
          placeholder={searchLabel}
          aria-label={searchLabel}
          onChange={(event) => onQueryChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.stopPropagation();
              onQueryChange('');
            }
          }}
          className="h-full min-w-0 flex-1 rounded-lg bg-transparent text-[12.5px] leading-none text-foreground outline-none placeholder:text-muted-foreground/80"
        />
        {query.length > 0 ? (
          <IconButton label={clearLabel} size="sm" onClick={() => onQueryChange('')} className="text-muted-foreground/80">
            <X strokeWidth={1.75} />
          </IconButton>
        ) : null}
      </div>
      <IconButton label={newThreadLabel} size="sm" onClick={onNewThread} className="-mr-1 text-muted-foreground/80">
        <SquarePen strokeWidth={1.75} />
      </IconButton>
    </div>
  );
}

export { SidebarSearchRow };
