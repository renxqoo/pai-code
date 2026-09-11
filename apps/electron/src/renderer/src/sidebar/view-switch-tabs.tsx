import * as React from 'react';
import { ArrowDownLeft, Folder, Hash } from 'lucide-react';
import { useStore } from 'zustand';

import { IconButton } from '@paiapp/ui';

import { cn } from '@/lib/utils';
import { copy } from '@/strings';
import type { SidebarView } from '@/sidebar/sidebar-view';
import { uiStore } from '@/ui/ui-store';

const { setSidebarView, collapseSidebar } = uiStore.getState();

type ViewTab = {
  key: SidebarView
  label: string
  icon: React.JSX.Element
}

/** 视图切换行：分组/项目胶囊分段控件 + 右侧收起侧栏；自订阅自派发（0 props）。 */
function ViewSwitchTabs(): React.JSX.Element {
  const view = useStore(uiStore, (s) => s.sidebarView);
  const tabs: readonly ViewTab[] = [
    {
      key: 'grouped',
      label: copy.sidebar.viewGrouped,
      icon: <Hash className="size-[13px] shrink-0" strokeWidth={1.75} />,
    },
    {
      key: 'projects',
      label: copy.sidebar.viewProjects,
      icon: <Folder className="size-[13px] shrink-0" strokeWidth={1.75} />,
    },
  ];

  return (
    <div className="flex items-center gap-[6px]">
      <div className="inline-flex items-center rounded-[10px] bg-sidebar-accent p-[2px]">
        {tabs.map((tab) => {
          const selected = view === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              aria-pressed={selected}
              onClick={() => setSidebarView(tab.key)}
              className={cn(
                'flex h-6 cursor-pointer items-center gap-[5px] rounded-[8px] px-2.5 text-[12px] leading-none font-medium outline-none select-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 motion-reduce:transition-none',
                selected ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {tab.icon}
              <span className="min-w-0 truncate">{tab.label}</span>
            </button>
          );
        })}
      </div>
      <IconButton
        label={copy.sidebar.collapseSidebarHint}
        size="xs"
        onClick={collapseSidebar}
        className="text-muted-foreground/80"
      >
        <ArrowDownLeft strokeWidth={1.75} />
      </IconButton>
    </div>
  );
}

const ViewSwitchTabsMemo = React.memo(ViewSwitchTabs);
export { ViewSwitchTabsMemo as ViewSwitchTabs };
