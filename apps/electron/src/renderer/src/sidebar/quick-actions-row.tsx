import * as React from 'react';
import { CalendarClock, CirclePlus, Search } from 'lucide-react';

import { copy } from '@/strings';
import { MODIFIER_KEY_LABEL } from '@/lib/platform';
import { uiStore } from '@/ui/ui-store';

/** 自动化入口刻意保留为占位（入口位稳定的用户裁决 U1），其余死入口已删除。 */
function noop(): void {}

const { openNewTask, openSidebarSearch } = uiStore.getState();

type QuickActionEntry = {
  key: string
  label: string
  hotkey?: string
  icon: React.JSX.Element
  onSelect: () => void
}

/** 快捷操作区：新建任务/搜索/自动化三行等高入口；自订阅自派发（0 props）。 */
function QuickActionsRow(): React.JSX.Element {
  const entries: readonly QuickActionEntry[] = [
    {
      key: 'new-task',
      label: copy.sidebar.newTask,
      hotkey: copy.sidebar.hotkeyNewTask(MODIFIER_KEY_LABEL),
      icon: <CirclePlus className="size-4 shrink-0 text-foreground/80" strokeWidth={1.75} />,
      onSelect: () => openNewTask(''),
    },
    {
      key: 'search',
      label: copy.sidebar.search,
      hotkey: copy.sidebar.hotkeySearch(MODIFIER_KEY_LABEL),
      icon: <Search className="size-4 shrink-0 text-foreground/80" strokeWidth={1.75} />,
      onSelect: openSidebarSearch,
    },
    {
      key: 'automation',
      label: copy.sidebar.automation,
      icon: <CalendarClock className="size-4 shrink-0 text-foreground/80" strokeWidth={1.75} />,
      onSelect: noop,
    },
  ];

  return (
    <div className="flex flex-col">
      {entries.map((entry) => (
        <button
          key={entry.key}
          type="button"
          onClick={entry.onSelect}
          className="flex h-[34px] w-full cursor-pointer items-center gap-[10px] rounded-[8px] px-2 text-left outline-none select-none hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {entry.icon}
          <span className="min-w-0 truncate text-[12.5px] leading-none font-medium text-foreground">{entry.label}</span>
          {entry.hotkey === undefined ? null : (
            <span className="ml-auto shrink-0 text-[11px] leading-none tracking-wide text-muted-foreground/80">{entry.hotkey}</span>
          )}
        </button>
      ))}
    </div>
  );
}

const QuickActionsRowMemo = React.memo(QuickActionsRow);
export { QuickActionsRowMemo as QuickActionsRow };
