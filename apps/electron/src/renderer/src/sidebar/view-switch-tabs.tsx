import * as React from 'react';
import { ArrowDownLeft, Folder, Hash, Trash2 } from 'lucide-react';

import { IconButton } from '@paiapp/ui';

import { cn } from '@/lib/utils';
import { copy } from '@/strings';
import type { SidebarView } from '@/sidebar/sidebar-view';

/** 尚未接线的占位工具钮统一落到空实现，按钮位保持稳定。 */
function noop(): void {}

type ViewSwitchTabsProps = {
  view: SidebarView
  onViewChange: (view: SidebarView) => void
  onCollapseSidebar: () => void
}

type ViewTab = {
  key: SidebarView
  label: string
  icon: React.JSX.Element
}

/** 占位工具钮样式：与 IconButton ghost xs 同观感，但不进入无障碍树。 */
const placeholderButtonClass =
  'flex size-5 cursor-pointer items-center justify-center rounded-md text-muted-foreground/80 outline-none';

/** 视图切换行：分组/项目胶囊分段控件 + 右侧收起侧栏与占位工具钮。 */
function ViewSwitchTabs({ view, onViewChange, onCollapseSidebar }: ViewSwitchTabsProps) {
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
              onClick={() => onViewChange(tab.key)}
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
        onClick={onCollapseSidebar}
        className="text-muted-foreground/80"
      >
        <ArrowDownLeft strokeWidth={1.75} />
      </IconButton>
      <span className="ml-auto flex items-center gap-0.5">
        {/* 占位工具钮：视觉占位，无语义无功能，aria-hidden + tabIndex=-1 移出无障碍树 */}
        <button type="button" aria-hidden="true" tabIndex={-1} onClick={noop} className={placeholderButtonClass}>
          <Hash className="size-3.5" strokeWidth={1.75} />
        </button>
        <button type="button" aria-hidden="true" tabIndex={-1} onClick={noop} className={placeholderButtonClass}>
          <Trash2 className="size-3.5" strokeWidth={1.75} />
        </button>
      </span>
    </div>
  );
}

const ViewSwitchTabsMemo = React.memo(ViewSwitchTabs);
export { ViewSwitchTabsMemo as ViewSwitchTabs };
