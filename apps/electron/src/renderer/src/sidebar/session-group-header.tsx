import * as React from 'react';

import { ChevronToggle } from '@paiapp/ui';

type SessionGroupHeaderProps = {
  projectName: string
  count: number
  collapsed: boolean
  onToggle: () => void
  ariaLabel: string
}

/** 项目分组头：整行可点折叠/展开，箭头随开合旋转，项目名 + 数量小字 + 右侧 hairline 收尾。 */
function SessionGroupHeader({ projectName, count, collapsed, onToggle, ariaLabel }: SessionGroupHeaderProps) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      aria-expanded={!collapsed}
      onClick={onToggle}
      className="flex w-full cursor-pointer items-center gap-[7px] rounded-[8px] px-[6px] py-[5px] text-left outline-none select-none hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <ChevronToggle open={!collapsed} variant="disclose" />
      <span className="min-w-0 truncate text-[12px] leading-none font-medium text-foreground">{projectName}</span>
      <span className="shrink-0 text-[10.5px] leading-none text-muted-foreground/70">{count}</span>
      <span aria-hidden="true" className="h-px min-w-[16px] flex-1 bg-sidebar-border" />
    </button>
  );
}

const SessionGroupHeaderMemo = React.memo(SessionGroupHeader);
export { SessionGroupHeaderMemo as SessionGroupHeader };
