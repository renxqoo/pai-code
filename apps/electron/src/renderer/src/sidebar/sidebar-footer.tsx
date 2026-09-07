import type { ReactNode } from 'react';

import { ChartNoAxesColumn, GitPullRequest, RotateCw, Settings } from 'lucide-react';

import { IconButton } from '@paiapp/ui';

export type SidebarFooterAction = {
  label: string;
  onSelect: () => void;
};

type SidebarFooterProps = {
  actions: readonly [SidebarFooterAction, SidebarFooterAction, SidebarFooterAction];
  refresh: SidebarFooterAction;
};

/** 侧栏底部：左侧工具入口，右侧刷新。 */
function SidebarFooter({ actions, refresh }: SidebarFooterProps) {
  const entries: ReadonlyArray<{ action: SidebarFooterAction; icon: ReactNode }> = [
    { action: actions[0], icon: <Settings strokeWidth={1.75} /> },
    { action: actions[1], icon: <GitPullRequest strokeWidth={1.75} /> },
    { action: actions[2], icon: <ChartNoAxesColumn strokeWidth={1.75} /> },
  ];

  return (
    <div className="flex shrink-0 items-center px-4 pt-2 pb-2">
      <div className="flex items-center gap-2">
        {entries.map(({ action, icon }) => (
          <IconButton
            key={action.label}
            label={action.label}
            size="sm"
            onClick={action.onSelect}
            className="text-muted-foreground/80"
          >
            {icon}
          </IconButton>
        ))}
      </div>
      <IconButton label={refresh.label} size="sm" onClick={refresh.onSelect} className="ml-auto text-muted-foreground/80">
        <RotateCw strokeWidth={1.75} />
      </IconButton>
    </div>
  );
}

export { SidebarFooter };
