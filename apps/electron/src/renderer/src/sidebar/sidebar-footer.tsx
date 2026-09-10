import { ChartNoAxesColumn, RotateCw, Settings } from 'lucide-react';

import { IconButton } from '@paiapp/ui';

import { workspaceActions } from '@/live/workspace-runtime';
import { copy } from '@/strings';
import { uiStore } from '@/ui/ui-store';

const { openSettings, openUsage } = uiStore.getState();

/** 侧栏底部：左侧设置/用量工具入口，右侧刷新；自订阅自派发（0 props）。 */
function SidebarFooter(): React.JSX.Element {
  return (
    <div className="flex shrink-0 items-center px-4 pt-2 pb-2">
      <div className="flex items-center gap-2">
        <IconButton label={copy.sidebar.settings} size="sm" onClick={openSettings} className="text-muted-foreground/80">
          <Settings strokeWidth={1.75} />
        </IconButton>
        <IconButton label={copy.sidebar.usage} size="sm" onClick={openUsage} className="text-muted-foreground/80">
          <ChartNoAxesColumn strokeWidth={1.75} />
        </IconButton>
      </div>
      <IconButton label={copy.sidebar.refresh} size="sm" onClick={workspaceActions.refreshSaved} className="ml-auto text-muted-foreground/80">
        <RotateCw strokeWidth={1.75} />
      </IconButton>
    </div>
  );
}

export { SidebarFooter };
