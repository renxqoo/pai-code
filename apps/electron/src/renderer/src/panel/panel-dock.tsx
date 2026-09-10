import * as React from 'react';
import { X } from 'lucide-react';

import { IconButton } from '@paiapp/ui';

import { WINDOWS_CAPTION_WIDTH } from '@/lib/platform';

type PanelDockTab = {
  id: string
  label: string
}

type PanelDockProps = {
  tabs: readonly PanelDockTab[]
  activeId: string | null
  onSelect: (id: string) => void
  onCloseTab: (id: string) => void
  /** 整组收起（Esc 同语义）。 */
  onClose: () => void
  closeAria: string
  /** 关闭单个标签的无障碍名（参数 = 标签文案）。 */
  closeTabAria: (label: string) => string
  /** 活跃 pane 内容（滚动与空态由各 pane 自理）。 */
  children: React.ReactNode
}

/**
 * 右侧面板容器：46px 标签行 + 活跃 pane。宽度与边框沿用原单槽面板
 * （w-[360px] border-l）；标签激活态用胶囊，hover 出单标签关闭钮。
 * 右端避让 Windows caption（与主区头部同节奏）。
 */
function PanelDock({ tabs, activeId, onSelect, onCloseTab, onClose, closeAria, closeTabAria, children }: PanelDockProps) {
  return (
    <aside className="flex h-full w-[360px] shrink-0 flex-col border-l border-border bg-background">
      <div
        className="flex h-[46px] shrink-0 items-center gap-[6px] border-b border-border pl-[10px]"
        style={{ paddingRight: WINDOWS_CAPTION_WIDTH + 10 }}
      >
        <div className="flex min-w-0 flex-1 items-center gap-[4px] overflow-x-auto">
          {tabs.map((tab) => {
            const active = tab.id === activeId;
            return (
              <div key={tab.id} className="group/tab relative shrink-0">
                <button
                  type="button"
                  onClick={() => onSelect(tab.id)}
                  aria-current={active ? 'true' : undefined}
                  className={`flex h-[26px] cursor-pointer items-center rounded-full px-[11px] text-[11.5px] leading-none outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 ${
                    active ? 'bg-accent font-medium text-foreground' : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground'
                  }`}
                >
                  {tab.label}
                </button>
                <button
                  type="button"
                  onClick={() => onCloseTab(tab.id)}
                  aria-label={closeTabAria(tab.label)}
                  className="absolute top-1/2 -right-[3px] hidden size-[14px] -translate-y-1/2 cursor-pointer items-center justify-center rounded-full bg-accent text-muted-foreground outline-none group-hover/tab:flex hover:text-foreground focus-visible:flex focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  <X className="size-[10px]" strokeWidth={2.25} />
                </button>
              </div>
            );
          })}
        </div>
        <IconButton label={closeAria} size="sm" onClick={onClose} className="shrink-0">
          <X strokeWidth={1.75} />
        </IconButton>
      </div>
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
    </aside>
  );
}

const PanelDockMemo = React.memo(PanelDock);
export { PanelDockMemo as PanelDock };
export type { PanelDockTab };
