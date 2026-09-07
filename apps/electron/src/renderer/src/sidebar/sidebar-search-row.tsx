import { Search, SquarePen } from 'lucide-react';

import { IconButton } from '@paiapp/ui';

type SidebarSearchRowProps = {
  searchLabel: string
  newThreadLabel: string
  onSearch: () => void
  onNewThread: () => void
}

/** 搜索行：左侧搜索入口 + 右侧新建会话。 */
function SidebarSearchRow({ searchLabel, newThreadLabel, onSearch, onNewThread }: SidebarSearchRowProps) {
  return (
    <div className="flex h-9 items-center">
      <button
        type="button"
        onClick={onSearch}
        className="flex h-full min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-lg px-2 text-left outline-none select-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <Search className="size-4 shrink-0 text-muted-foreground/70" strokeWidth={1.75} />
        <span className="truncate text-[12.5px] leading-none text-muted-foreground/80">{searchLabel}</span>
      </button>
      <IconButton label={newThreadLabel} size="sm" onClick={onNewThread} className="-mr-1 text-muted-foreground/80">
        <SquarePen strokeWidth={1.75} />
      </IconButton>
    </div>
  );
}

export { SidebarSearchRow };
