import * as React from 'react';
import { Folder, Maximize2, PanelRight, Plus } from 'lucide-react';

import { IconButton, SplitButton } from '@paiapp/ui';

import { Button } from '@/components/ui/button';
import { GitHubMarkIcon } from '@/icons/github-mark-icon';
import { WINDOWS_CAPTION_WIDTH } from '@/lib/platform';
import { ThreadTabs } from '@/thread/thread-tabs';

type ThreadTabsState = {
  addLabel: string
  onAdd: () => void
}

/** 右侧面板槽位：与 workspace-screen 的 SidePanel 同构 */
type ActiveSidePanel = 'diff' | 'agents' | null

type ThreadHeaderProps = {
  projectName: string
  sessionTitle: string
  /** 侧栏收起时左侧避让固定标题块（--titlebar-left-w 由标题覆盖块发布） */
  sidebarCollapsed: boolean
  labels: {
    addAction: string
    open: string
    commitPushPr: string
    toggleSplitView: string
    toggleMaximize: string
  }
  tabs: ThreadTabsState
  activePanel: ActiveSidePanel
  openMenu: readonly string[]
  commitMenu: readonly string[]
  onAddAction: () => void
  onOpen: () => void
  onCommit: () => void
  onOpenMenuSelect: (label: string) => void
  onCommitMenuSelect: (label: string) => void
  onToggleSplitView: () => void
  onToggleMaximize: () => void
}

/** 主区头部：全宽拖拽行（与标题覆盖块同排，无侧栏间隙断档）——面包屑 + 主操作 + 标签 + 布局开关；
 * 内容用 padding 对齐内容列节奏（主区 40px + 原行内留白），右端避让 Windows caption。 */
function ThreadHeader({
  projectName,
  sessionTitle,
  sidebarCollapsed,
  labels,
  tabs,
  activePanel,
  openMenu,
  commitMenu,
  onAddAction,
  onOpen,
  onCommit,
  onOpenMenuSelect,
  onCommitMenuSelect,
  onToggleSplitView,
  onToggleMaximize,
}: ThreadHeaderProps) {
  return (
    <header
      className="app-drag flex h-[46px] shrink-0 items-center gap-3 pl-[20px]  transition-[padding] duration-200 motion-reduce:transition-none"
      style={{
        paddingLeft: sidebarCollapsed ? 'calc(var(--titlebar-left-w, 190px))' : undefined,
        paddingRight: WINDOWS_CAPTION_WIDTH + 20,
      }}
    >
      <div className="app-no-drag flex min-w-0 items-center gap-2">
        <Folder className="size-3 shrink-0 text-muted-foreground/80" strokeWidth={1.75} />
        <button
          type="button"
          onClick={onOpen}
          className="cursor-pointer truncate text-[12px] leading-none text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {projectName}
        </button>
        <span aria-hidden="true" className="shrink-0 px-[3px] text-[12.5px] leading-none text-muted-foreground/50">
          /
        </span>
        <h1 className="truncate text-[12.5px] leading-none font-medium text-foreground">{sessionTitle}</h1>
      </div>
      <div className="app-no-drag ml-auto flex shrink-0 items-center gap-[10px]">
        <Button
          variant="outline"
          onClick={onAddAction}
          className="h-[23px] gap-[5px] rounded-full px-[10px] text-[11.5px] leading-none font-medium [&_svg]:size-3 [&_svg]:text-muted-foreground"
        >
          <Plus className="size-3" strokeWidth={2} />
          {labels.addAction}
        </Button>
        <SplitButton
          label={labels.open}
          icon={<Folder className="size-3" strokeWidth={1.75} />}
          onClick={onOpen}
          menuItems={openMenu}
          onMenuSelect={onOpenMenuSelect}
        />
        <SplitButton
          label={labels.commitPushPr}
          icon={<GitHubMarkIcon />}
          onClick={onCommit}
          menuItems={commitMenu}
          onMenuSelect={onCommitMenuSelect}
        />
      </div>
      <div className="app-no-drag ml-[18px] flex shrink-0 items-center">
        <ThreadTabs addLabel={tabs.addLabel} onAdd={tabs.onAdd} />
      </div>
      <div className="app-no-drag  flex shrink-0 items-center gap-[10px]">
        <IconButton label={labels.toggleMaximize} size="sm" onClick={onToggleMaximize}>
          <Maximize2 strokeWidth={1.75} />
        </IconButton>
        <IconButton
          label={labels.toggleSplitView}
          size="sm"
          aria-expanded={activePanel !== null}
          onClick={onToggleSplitView}
        >
          <PanelRight strokeWidth={1.75} />
        </IconButton>
      </div>
    </header>
  );
}

const ThreadHeaderMemo = React.memo(ThreadHeader);
export { ThreadHeaderMemo as ThreadHeader };
export type { ThreadTabsState };
