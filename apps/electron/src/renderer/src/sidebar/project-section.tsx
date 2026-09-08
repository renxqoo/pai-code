import * as React from 'react';
import { Folder } from 'lucide-react';

import { ChevronToggle } from '@paiapp/ui';

import { copy } from '@/strings';
import type { ProjectGroup } from '@/sidebar/build-project-groups';
import { SessionRow } from '@/sidebar/session-row';

type ProjectSectionProps = {
  group: ProjectGroup
  /** 该组是否处于折叠态（折叠集合由外层状态持有）。 */
  collapsed: boolean
  ages: Readonly<Record<string, string>>
  activeSessionId: string
  onToggleCollapse: (key: string) => void
  /** 「显示更多」：解除该组的可见条数截断。 */
  onExpand: (key: string) => void
  onSelect: (sessionId: string) => void
  onClose?: (sessionId: string) => void
  onRename?: (sessionId: string, name: string) => void
  /** 置顶切换（键为 sessionPath）；sessionPath 为 null 的行无置顶入口。 */
  onTogglePin?: (sessionPath: string) => void
}

/** 项目分组：文件夹行（折叠切换）+ 缩进会话行 + 组末「显示更多」。 */
function ProjectSection({
  group,
  collapsed,
  ages,
  activeSessionId,
  onToggleCollapse,
  onExpand,
  onSelect,
  onClose,
  onRename,
  onTogglePin,
}: ProjectSectionProps) {
  return (
    <section className="flex flex-col gap-[2px]">
      <button
        type="button"
        aria-expanded={!collapsed}
        aria-label={`${copy.sidebar.collapseGroup} · ${group.projectName}`}
        onClick={() => onToggleCollapse(group.key)}
        className="flex h-8 w-full cursor-pointer items-center gap-[7px] rounded-[8px] px-2 text-left outline-none select-none hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <ChevronToggle open={!collapsed} variant="disclose" />
        <Folder className="size-[14px] shrink-0 text-muted-foreground/80" strokeWidth={1.75} />
        <span className="min-w-0 truncate text-[12.5px] leading-none font-medium text-foreground">
          {group.projectName}
        </span>
      </button>
      {collapsed
        ? null
        : group.visible.map((session) => (
            <SessionRow
              key={session.id}
              session={session}
              age={ages[session.id] ?? ''}
              active={session.id === activeSessionId}
              indent
              onSelect={onSelect}
              onClose={onClose}
              onRename={onRename}
              onTogglePin={onTogglePin}
            />
          ))}
      {!collapsed && group.total > group.visible.length ? (
        <button
          type="button"
          onClick={() => onExpand(group.key)}
          className="flex h-[26px] w-full cursor-pointer items-center rounded-[8px] pr-2 pl-6 text-left text-[11.5px] leading-none text-muted-foreground outline-none select-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {copy.sidebar.showMore}
        </button>
      ) : null}
    </section>
  );
}

const ProjectSectionMemo = React.memo(ProjectSection);
export { ProjectSectionMemo as ProjectSection };
