import * as React from 'react';
import { ChevronDown, Pin, RefreshCw } from 'lucide-react';

import { IconButton, MenuButton, type MenuItemDef } from '@paiapp/ui';

import { formatRelativeAge } from '@/lib/relative-age';
import { cn } from '@/lib/utils';
import { copy } from '@/strings';

import { SettingsCard } from './settings-card';
import { SettingsPageHeader } from './settings-page-header';

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
  onRefresh: () => void
}

const filterTriggerClassName =
  'flex h-9 cursor-pointer items-center gap-[6px] rounded-lg border border-border bg-background px-3 text-left text-[13px] text-foreground outline-none select-none hover:border-foreground/30 aria-expanded:border-foreground/30 focus-visible:ring-3 focus-visible:ring-ring/50 [&_svg]:shrink-0';

/** History 分区：项目过滤 + 已保存会话卡列表（点击 resume），置顶卡排前，hover 出现置顶/显示操作。 */
function HistorySection({ saved, pinned, projects, onTogglePin, onReveal, onOpenSaved, onRefresh }: HistorySectionProps) {
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
      <SettingsPageHeader title={copy.settings.historyTitle} description={copy.settings.historyDesc} />
      <div className="flex flex-col gap-[16px]">
        <div className="flex items-center justify-between gap-[16px]">
          <MenuButton
            align="start"
            popupMinWidth={200}
            items={filterItems}
            onSelect={selectFilter}
            triggerClassName={filterTriggerClassName}
            trigger={
              <>
                <span className="max-w-[220px] truncate">{filterLabel}</span>
                <ChevronDown className="size-3 shrink-0 text-muted-foreground/70" strokeWidth={2} />
              </>
            }
          />
          <IconButton label={copy.settings.refresh} onClick={onRefresh}>
            <RefreshCw strokeWidth={1.75} />
          </IconButton>
        </div>
        {saved.length === 0 ? (
          <p className="text-[12.5px] leading-[18px] text-muted-foreground">{copy.settings.historyEmpty}</p>
        ) : (
          <div className="flex flex-col gap-[10px]">
            {orderedSessions.slice(0, 40).map((session) => {
              const isPinned = pinned.has(session.sessionPath);
              return (
                <SettingsCard key={session.sessionPath} className="group/history-row relative transition-colors hover:bg-accent/30">
                  {isPinned ? (
                    <Pin aria-hidden="true" className="absolute top-1/2 left-[7px] size-[11px] -translate-y-1/2 text-muted-foreground" strokeWidth={1.75} />
                  ) : null}
                  <button
                    type="button"
                    onClick={() => onOpenSaved(session.sessionPath)}
                    className={cn(
                      'flex w-full cursor-pointer flex-col items-start gap-[3px] rounded-xl px-[16px] py-[12px] text-left outline-none select-none focus-visible:ring-3 focus-visible:ring-ring/50',
                      isPinned && 'pl-[24px]',
                    )}
                  >
                    <span className="w-full truncate text-[13px] leading-[18px] text-foreground">{session.title}</span>
                    <span className="w-full truncate text-[11.5px] leading-[16px] text-muted-foreground">
                      {session.cwd} · {formatRelativeAge(now, session.modifiedAt)} · {session.messageCount} {copy.settings.historyMsgs}
                    </span>
                  </button>
                  <div className="absolute top-1/2 right-[10px] hidden -translate-y-1/2 items-center gap-[8px] rounded-lg bg-background px-[6px] py-[3px] group-focus-within/history-row:flex group-hover/history-row:flex">
                    <button
                      type="button"
                      onClick={() => onTogglePin(session.sessionPath)}
                      className="cursor-pointer rounded-md px-[4px] py-[3px] text-[11.5px] leading-none text-muted-foreground outline-none select-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
                    >
                      {isPinned ? copy.settings.unpin : copy.settings.pin}
                    </button>
                    <button
                      type="button"
                      onClick={() => onReveal(session.sessionPath)}
                      className="cursor-pointer rounded-md px-[4px] py-[3px] text-[11.5px] leading-none text-muted-foreground outline-none select-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
                    >
                      {copy.settings.revealInFinder}
                    </button>
                  </div>
                </SettingsCard>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}

export { HistorySection };
