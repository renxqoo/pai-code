import { ChevronDown, Folder, FolderPlus } from 'lucide-react';

import { IconButton, MenuButton } from '@paiapp/ui';

import type { MenuItemDef } from '@paiapp/ui';

type SidebarProjectsRowProps = {
  allProjectsLabel: string
  newProjectLabel: string
  projects: readonly string[]
  selectedProject: string
  onSelectProject: (project: string) => void
  onNewProject: () => void
}

/** 项目筛选行：下拉切换项目范围，右侧新建项目。 */
function SidebarProjectsRow({
  allProjectsLabel,
  newProjectLabel,
  projects,
  selectedProject,
  onSelectProject,
  onNewProject,
}: SidebarProjectsRowProps) {
  const items: MenuItemDef[] = [
    { kind: 'item', id: allProjectsLabel, label: allProjectsLabel, selected: selectedProject === allProjectsLabel },
    { kind: 'separator' },
    ...projects.map((project) => ({
      kind: 'item' as const,
      id: project,
      label: project,
      selected: selectedProject === project,
    })),
  ];

  return (
    <div className="flex h-9 items-center">
      <MenuButton
        aria-label={allProjectsLabel}
        align="start"
        popupMinWidth={168}
        items={items}
        onSelect={onSelectProject}
        triggerClassName="flex h-full min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-lg px-2 text-left outline-none select-none aria-expanded:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50"
        trigger={
          <>
            <Folder className="size-4 shrink-0 text-muted-foreground/70" strokeWidth={1.75} />
            <span className="truncate text-[12.5px] leading-none text-muted-foreground/80">{allProjectsLabel}</span>
            <ChevronDown className="ml-[6px] size-[13px] shrink-0 text-muted-foreground/60" strokeWidth={2} />
          </>
        }
      />
      <IconButton label={newProjectLabel} size="sm" onClick={onNewProject} className="-mr-1 text-muted-foreground/80">
        <FolderPlus strokeWidth={1.75} />
      </IconButton>
    </div>
  );
}

export { SidebarProjectsRow };
