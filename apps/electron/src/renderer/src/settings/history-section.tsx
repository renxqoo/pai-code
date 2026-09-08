import * as React from 'react';
import { ChevronDown, Pin } from 'lucide-react';

import { MenuButton, type MenuItemDef } from '@paiapp/ui';

import { formatRelativeAge } from '@/lib/relative-age';
import { cn } from '@/lib/utils';
import { copy } from '@/strings';

/** 过滤菜单里「全部」选项的固定 id（非用户可见文案） */
const ALL_FILTER_ID = '@@all';

type SavedSession = {
  sessionPath: string
  title: string
  cwd: string
  modifiedAt: number
  messageCount: number
}

type HistorySectionProps = {
  saved: ReadonlyArray<SavedSession>
  pinned: ReadonlySet<string>
  /** cwd 去重列表，作为过滤菜单选项 */
  projects: readonly string[]
  onTogglePin: (sessionPath: string) => void
  onReveal: (sessionPath: string) => void
  onOpenSaved: (sessionPath: string) => void
  onRefreshSaved: () => void
}

/** History 分区：已保存会话卡列表（点击 resume），标题行可按项目过滤，置顶卡排前，支持手动刷新。 */
function HistorySection({
  saved,
  pinned,
  projects,
  onTogglePin,
  onReveal,
  onOpenSaved,
  onRefreshSaved,
}: HistorySectionProps) {
  const now = Date.now();
  /** 当前项目过滤；null = 全部 */
  const [projectFilter, setProjectFilter] = React.useState<string | null>(null);

  const filterLabel = projectFilter === null ? copy.settings.historyFilterAll : copy.settings.historyFilter(projectFilter);
  const filterItems: MenuItemDef[] = [
    { kind: 'item', id: ALL_FILTER_ID, label: copy.settings.historyFilterAll, selected: projectFilter === null },
    ...(projects.length > 0 ? [{ kind: 'separator' as const }] : []),
    ...projects.map((project) => ({
      kind: 'item' as const,
      id: project,
      label: copy.settings.historyFilter(project),
      selected: projectFilter === project,
    })),
  ];
  const selectFilter = (id: string): void => {
    setProjectFilter(id === ALL_FILTER_ID ? null : id);
  };

  const visibleSessions = projectFilter === null ? saved : saved.filter((session) => session.cwd === projectFilter);
  // 置顶在前，其余保持传入顺序（分区各自保序）
  const orderedSessions = [
    ...visibleSessions.filter((session) => pinned.has(session.sessionPath)),
    ...visibleSessions.filter((session) => !pinned.has(session.sessionPath)),
  ];

  return (
    <section>
      <div className="flex items-center justify-between pb-[10px]">
        <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-muted-foreground">{copy.settings.historyTitle}</p>
        <div className="flex items-center gap-[10px]">
          <MenuButton
            align="end"
            popupMinWidth={168}
            items={filterItems}
            onSelect={selectFilter}
            triggerClassName="flex cursor-pointer items-center gap-[5px] rounded-[6px] px-[5px] py-[2px] text-[11.5px] leading-none text-muted-foreground outline-none select-none hover:text-foreground aria-expanded:bg-accent aria-expanded:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
            trigger={
              <>
                <span className="max-w-[140px] truncate">{filterLabel}</span>
                <ChevronDown className="size-[12px] shrink-0" strokeWidth={2} />
              </>
            }
          />
          <button type="button" onClick={onRefreshSaved} className="text-[11.5px] text-muted-foreground hover:text-foreground">
            {copy.settings.refresh}
          </button>
        </div>
      </div>
      {saved.length === 0 ? <p className="text-[12.5px] text-muted-foreground">{copy.settings.historyEmpty}</p> : null}
      <div className="flex flex-col gap-[6px]">
        {orderedSessions.slice(0, 40).map((session) => {
          const isPinned = pinned.has(session.sessionPath);
          return (
            <div
              key={session.sessionPath}
              className="group/history-row relative rounded-[10px] border border-border hover:bg-muted/50"
            >
              {isPinned ? (
                <Pin aria-hidden="true" className="absolute top-[10px] left-[5px] size-[11px] text-muted-foreground" strokeWidth={1.75} />
              ) : null}
              <button
                type="button"
                onClick={() => onOpenSaved(session.sessionPath)}
                className={cn(
                  'flex w-full cursor-pointer flex-col items-start gap-[3px] rounded-[10px] px-[12px] py-[9px] text-left outline-none select-none focus-visible:ring-3 focus-visible:ring-ring/50',
                  isPinned && 'pl-[22px]',
                )}
              >
                <span className="w-full truncate text-[12.5px] text-foreground">{session.title}</span>
                <span className="text-[11px] text-muted-foreground">
                  {formatRelativeAge(now, session.modifiedAt)} · {session.messageCount} {copy.settings.historyMsgs} · {session.cwd}
                </span>
              </button>
              <div className="absolute top-1/2 right-[8px] hidden -translate-y-1/2 items-center gap-[10px] rounded-[6px] bg-background px-[6px] py-[3px] group-focus-within/history-row:flex group-hover/history-row:flex">
                <button
                  type="button"
                  onClick={() => onTogglePin(session.sessionPath)}
                  className="rounded-[4px] text-[11.5px] text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  {isPinned ? copy.settings.unpin : copy.settings.pin}
                </button>
                <button
                  type="button"
                  onClick={() => onReveal(session.sessionPath)}
                  className="rounded-[4px] text-[11.5px] text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  {copy.settings.revealInFinder}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export { HistorySection };
