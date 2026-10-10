import * as React from 'react';
import { ArrowDownLeft, Folder } from 'lucide-react';

import { IconButton } from '@x3code/ui';

import { copy } from '@/strings';
import { uiStore } from '@/ui/ui-store';

const { collapseSidebar } = uiStore.getState();

/** 视图切换行：项目胶囊 + 右侧收起侧栏（项目为唯一视图，胶囊仅作视图标识）。 */
function ViewSwitchTabs(): React.JSX.Element {
  return (
    <div className="flex items-center gap-[6px]">
      <div className="inline-flex items-center rounded-[10px] bg-sidebar-accent p-[2px]">
        <div
          aria-pressed="true"
          className="flex h-6 cursor-default items-center gap-[5px] rounded-[8px] bg-background px-2.5 text-[12px] leading-none font-medium text-foreground shadow-sm"
        >
          <Folder className="size-[13px] shrink-0" strokeWidth={1.75} />
          <span className="min-w-0 truncate">{copy.sidebar.viewProjects}</span>
        </div>
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
