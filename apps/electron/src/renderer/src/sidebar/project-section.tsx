import * as React from 'react';
import { Folder, ListTree } from 'lucide-react';
import { useStore } from 'zustand';

import { ChevronToggle, MenuButton, type MenuItemDef } from '@paiapp/ui';

import { cn } from '@/lib/utils';
import { copy } from '@/strings';
import { workspaceActions } from '@/live/workspace-runtime';
import { openProjectFiles } from '@/sidebar/project-files';
import type { ProjectGroup } from '@/sidebar/build-project-groups';
import { SessionRow } from '@/sidebar/session-row';
import { uiStore } from '@/ui/ui-store';

type ProjectSectionProps = {
  group: ProjectGroup
  ages: Readonly<Record<string, string>>
  activeSessionId: string
}

/** 项目行「更多」菜单：id 为稳定英文标识，映射在 onSelect；文案取自 strings。 */
const projectMenuItems: readonly MenuItemDef[] = [
  { kind: 'item', id: 'new-task', label: copy.sidebar.newTask },
  { kind: 'item', id: 'remove-project', label: copy.sidebar.removeProject },
  { kind: 'item', id: 'view-files', label: copy.sidebar.viewProjectFiles },
];

/** 项目行内动作钮：与 SessionRow 行内按钮同一形态。 */
const moreTriggerClass =
  'flex size-5 cursor-pointer items-center justify-center rounded-[5px] text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50';

/** 触发器淡入：常驻占位（外层 size-5 网格），hover/键盘聚焦/菜单打开中可见，标题宽度不随 hover 变化。 */
const moreTriggerRevealClass =
  'col-start-1 row-start-1 opacity-0 invisible transition-opacity duration-150 motion-reduce:transition-none group-hover/row:visible group-hover/row:opacity-100 group-focus-within/row:visible group-focus-within/row:opacity-100 group-has-data-[popup-open]/row:visible group-has-data-[popup-open]/row:opacity-100';

/** 项目分组：文件夹行（折叠切换 + hover「更多」菜单）+ 缩进会话行 + 组末「显示更多」。
 * 折叠态/折叠动作与菜单动作自订阅自派发（数据 props 只承载组内容）。 */
function ProjectSection({ group, ages, activeSessionId }: ProjectSectionProps) {
  const collapsed = useStore(uiStore, (s) => s.sidebarGroupFold.collapsed.has(group.key));
  const selectMenuAction = (id: string): void => {
    if (id === 'new-task') uiStore.getState().openNewTask(group.key);
    else if (id === 'remove-project') workspaceActions.removeProject(group.key);
    else if (id === 'view-files') openProjectFiles(group.key);
  };
  return (
    <section className="flex flex-col gap-[2px]">
      {/* 行级焦点环只随键盘聚焦出现（has(:focus-visible)）：鼠标点击行内钮后焦点留在行内，不再留下常驻边框 */}
      <div className="group/row flex h-8 w-full items-center rounded-[8px] pr-[6px] select-none hover:bg-accent has-[button:focus-visible]:ring-3 has-[button:focus-visible]:ring-ring/50">
        <button
          type="button"
          aria-expanded={!collapsed}
          aria-label={`${copy.sidebar.collapseGroup} · ${group.projectName}`}
          onClick={() => uiStore.getState().toggleGroupFoldKey(group.key)}
          className="flex h-8 min-w-0 flex-1 cursor-pointer items-center gap-[7px] rounded-[8px] px-2 text-left outline-none"
        >
          <ChevronToggle open={!collapsed} variant="disclose" />
          <Folder className="size-[14px] shrink-0 text-muted-foreground/80" strokeWidth={1.75} />
          <span className="min-w-0 truncate text-[12.5px] leading-none font-medium text-foreground">
            {group.projectName}
          </span>
        </button>
        {/* 菜单打开中即使鼠标已移出行也要保持锚点可见（data-popup-open 由 Base UI 落在触发器上） */}
        <span className="grid size-5 shrink-0 place-items-center">
          <MenuButton
            aria-label={copy.thread.projectMenuAria}
            align="end"
            popupMinWidth={148}
            trigger={<ListTree className="size-3" strokeWidth={1.75} />}
            triggerClassName={cn(moreTriggerClass, moreTriggerRevealClass)}
            items={projectMenuItems}
            onSelect={selectMenuAction}
          />
        </span>
      </div>
      {collapsed
        ? null
        : group.visible.map((session) => (
            <SessionRow
              key={session.id}
              session={session}
              age={ages[session.id] ?? ''}
              active={session.id === activeSessionId}
              indent
            />
          ))}
      {!collapsed && group.total > group.visible.length ? (
        <button
          type="button"
          onClick={() => uiStore.getState().expandGroupKey(group.key)}
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
