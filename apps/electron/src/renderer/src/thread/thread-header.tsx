import * as React from 'react';
import { ChevronDown, Folder, Maximize2, MoreHorizontal, PanelRight, Plus } from 'lucide-react';

import { IconButton, MenuButton, type MenuItemDef } from '@paiapp/ui';

import { WINDOWS_CAPTION_WIDTH } from '@/lib/platform';
import { reduceTitleEdit, titleCommit, type TitleEditState } from '@/thread/title-edit';
import type { ThreadStatusKind } from '@/thread/thread-status';

type ThreadHeaderProps = {
  projectName: string
  sessionTitle: string
  /** 侧栏收起时左侧避让固定标题块（--titlebar-left-w 由标题覆盖块发布） */
  sidebarCollapsed: boolean
  status: ThreadStatusKind
  /** 右侧面板是否有打开的 tab（开关按钮的展开态）。 */
  panelOpen: boolean
  labels: {
    toggleMaximize: string
    toggleSplitView: string
    viewMenuAria: string
    statusAria: string
    renameTitleAria: string
    projectMenuAria: string
    sessionMenuAria: string
    statusLabel: string
  }
  projectMenu: readonly MenuItemDef[]
  sessionMenu: readonly MenuItemDef[]
  viewMenu: readonly MenuItemDef[]
  onProjectAction: (id: string) => void
  onViewAction: (id: string) => void
  onRenameTitle: (name: string) => void
  onStatusJump: () => void
  onTogglePanel: () => void
  onSessionAction: (id: string) => void
  onToggleMaximize: () => void
}

/** 状态圆点配色：等待权限琥珀呼吸、运行绿脉冲、压缩蓝脉冲、排队灰。 */
const STATUS_DOT_CLASS: Record<Exclude<ThreadStatusKind, 'idle'>, string> = {
  permission: 'bg-amber-500 animate-pulse',
  running: 'bg-emerald-500 animate-pulse',
  compacting: 'bg-sky-500 animate-pulse',
  queued: 'bg-muted-foreground/70',
};

/**
 * 主区头部：全宽拖拽行（与标题覆盖块同排）——项目菜单 + 可编辑标题 + 状态 chip +
 * 变更入口 + 会话菜单 + 新建 + 视图菜单 + 全屏开关；内容右端避让 Windows caption。
 * 「重命名」是头部内部 UX（点标题/菜单进入行内编辑），其余动作经回调上抛。
 */
function ThreadHeader({
  projectName,
  sessionTitle,
  sidebarCollapsed,
  status,
  panelOpen,
  labels,
  projectMenu,
  sessionMenu,
  viewMenu,
  onProjectAction,
  onViewAction,
  onRenameTitle,
  onStatusJump,
  onTogglePanel,
  onSessionAction,
  onToggleMaximize,
}: ThreadHeaderProps) {
  const [editing, setEditing] = React.useState<TitleEditState>(null);
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  // 标题被外部更新（切会话/改名成功/自动命名）即退出编辑态——
  // 否则切会话后回车会把旧会话草稿提交到新会话（T30 审查 低-15）
  React.useEffect(() => {
    setEditing(null);
  }, [sessionTitle]);

  const startEditing = (): void => {
    setEditing(reduceTitleEdit(editing, { kind: 'start', title: sessionTitle }));
    // 菜单触发路径下输入框在 setState 后的下一帧才挂载，聚焦放到微任务之后
    window.setTimeout(() => inputRef.current?.select(), 0);
  };
  const commitEditing = (): void => {
    const outcome = titleCommit(editing, sessionTitle);
    setEditing(null);
    if (outcome !== null) onRenameTitle(outcome.name);
  };
  const onSessionMenuSelect = (id: string): void => {
    if (id === 'rename') {
      startEditing();
      return;
    }
    onSessionAction(id);
  };

  return (
    <header
      className="app-drag flex h-[46px] shrink-0 items-center gap-3 pl-[20px]  transition-[padding] duration-200 motion-reduce:transition-none"
      style={{
        paddingLeft: sidebarCollapsed ? 'calc(var(--titlebar-left-w, 190px))' : undefined,
        paddingRight: WINDOWS_CAPTION_WIDTH + 20,
      }}
    >
      <div className="app-no-drag flex min-w-0 items-center gap-2">
        <MenuButton
          trigger={
            <span className="flex cursor-pointer items-center gap-[3px] rounded px-[3px] py-[2px] text-[12px] leading-none text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50">
              <Folder className="size-3 shrink-0 text-muted-foreground/80" strokeWidth={1.75} />
              <span className="truncate">{projectName}</span>
              <ChevronDown className="size-3 shrink-0 text-muted-foreground/60" strokeWidth={2} />
            </span>
          }
          items={projectMenu}
          onSelect={onProjectAction}
          aria-label={labels.projectMenuAria}
        />
        <span aria-hidden="true" className="shrink-0 px-[3px] text-[12.5px] leading-none text-muted-foreground/50">
          /
        </span>
        {editing === null ? (
          <button
            type="button"
            onClick={startEditing}
            title={labels.renameTitleAria}
            className="cursor-pointer truncate rounded px-[3px] py-[2px] text-[12.5px] leading-none font-medium text-foreground outline-none transition-colors hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            {sessionTitle}
          </button>
        ) : (
          <input
            ref={inputRef}
            value={editing.draft}
            aria-label={labels.renameTitleAria}
            onChange={(event) => setEditing(reduceTitleEdit(editing, { kind: 'change', value: event.target.value }))}
            onBlur={commitEditing}
            onKeyDown={(event) => {
              if (event.key === 'Enter') commitEditing();
              else if (event.key === 'Escape') setEditing(null);
            }}
            className="h-[22px] w-[200px] rounded-md bg-transparent px-[4px] text-[12.5px] leading-none font-medium text-foreground outline-none ring-1 ring-ring/40 focus-visible:ring-2 focus-visible:ring-ring"
          />
        )}
        {status === 'idle' ? null : (
          <button
            type="button"
            onClick={onStatusJump}
            aria-label={labels.statusAria}
            title={labels.statusLabel}
            className="flex shrink-0 cursor-pointer items-center gap-[5px] rounded-full px-[7px] py-[3px] text-[11px] leading-none text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <span aria-hidden="true" className={`size-[6px] shrink-0 rounded-full ${STATUS_DOT_CLASS[status]}`} />
            {labels.statusLabel}
          </button>
        )}
      </div>
      <div className="app-no-drag ml-auto flex shrink-0 items-center gap-[10px]">
        <MenuButton
          trigger={
            <span className="flex size-[26px] cursor-pointer items-center justify-center rounded-full text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50">
              <MoreHorizontal className="size-[15px]" strokeWidth={1.75} />
            </span>
          }
          items={sessionMenu}
          onSelect={onSessionMenuSelect}
          aria-label={labels.sessionMenuAria}
        />
      </div>
      <div className="app-no-drag ml-[8px] flex shrink-0 items-center gap-[10px]">
        <MenuButton
          trigger={
            <span className="flex size-[26px] cursor-pointer items-center justify-center rounded-full text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50">
              <Plus className="size-[15px]" strokeWidth={1.75} />
            </span>
          }
          items={viewMenu}
          onSelect={onViewAction}
          align="end"
          aria-label={labels.viewMenuAria}
        />
        <IconButton label={labels.toggleMaximize} size="sm" onClick={onToggleMaximize}>
          <Maximize2 strokeWidth={1.75} />
        </IconButton>
        {/*
         * 右侧面板开关（还原旧头部位次：最大化右侧）：面板开着（任一 tab 在）
         * 点击整组收起，关着点击以 Diff 视图打开；多标签细节入口在「+视图」
         * 菜单与 ⌘⇧D/⌘⇧A。
         */}
        <IconButton
          label={labels.toggleSplitView}
          size="sm"
          aria-expanded={panelOpen}
          onClick={onTogglePanel}
        >
          <PanelRight strokeWidth={1.75} />
        </IconButton>
      </div>
    </header>
  );
}

const ThreadHeaderMemo = React.memo(ThreadHeader);
export { ThreadHeaderMemo as ThreadHeader };
