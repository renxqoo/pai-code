import * as React from 'react';
import { Activity, CirclePlus, LayoutGrid, Search } from 'lucide-react';

import { copy } from '@/strings';
import { MODIFIER_KEY_LABEL } from '@/lib/platform';

/** 尚未接线的快捷入口统一落到空实现，入口位保持稳定。 */
function noop(): void {}

type QuickActionsRowProps = {
  onNewThread: () => void
  /** 打开侧栏内联搜索（父级持有展开态）。 */
  onOpenSearch: () => void
  /** 打开运行状态监控页。 */
  onOpenRuntime: () => void
  /** 异常亮标：宿主相位异常或存在 dead worker 时为 true。 */
  runtimeAttention: boolean
}

type QuickActionEntry = {
  key: string
  label: string
  hotkey?: string
  icon: React.JSX.Element
  onSelect: () => void
  /** 行尾异常徽标（宿主/worker 需要关注）。 */
  attention?: boolean
}

/** 快捷操作区：新建任务/搜索/运行状态/插件市场四行等高入口；插件市场为占位入口。
 * 运行状态行尾亮异常徽标（红点）提示宿主相位异常或存在 dead worker。 */
function QuickActionsRow({ onNewThread, onOpenSearch, onOpenRuntime, runtimeAttention }: QuickActionsRowProps) {
  const entries: readonly QuickActionEntry[] = [
    {
      key: 'new-task',
      label: copy.sidebar.newTask,
      hotkey: copy.sidebar.hotkeyNewTask(MODIFIER_KEY_LABEL),
      icon: <CirclePlus className="size-4 shrink-0 text-foreground/80" strokeWidth={1.75} />,
      onSelect: onNewThread,
    },
    {
      key: 'search',
      label: copy.sidebar.search,
      hotkey: copy.sidebar.hotkeySearch(MODIFIER_KEY_LABEL),
      icon: <Search className="size-4 shrink-0 text-foreground/80" strokeWidth={1.75} />,
      onSelect: onOpenSearch,
    },
    {
      key: 'runtime',
      label: copy.sidebar.runtime,
      icon: <Activity className="size-4 shrink-0 text-foreground/80" strokeWidth={1.75} />,
      onSelect: onOpenRuntime,
      attention: runtimeAttention,
    },
    {
      key: 'plugin-market',
      label: copy.sidebar.pluginMarket,
      icon: <LayoutGrid className="size-4 shrink-0 text-foreground/80" strokeWidth={1.75} />,
      onSelect: noop,
    },
  ];

  return (
    <div className="flex flex-col">
      {entries.map((entry) => (
        <button
          key={entry.key}
          type="button"
          onClick={entry.onSelect}
          aria-label={entry.attention === true ? `${entry.label} · ${copy.sidebar.runtimeAttention}` : undefined}
          title={entry.attention === true ? `${entry.label} · ${copy.sidebar.runtimeAttention}` : undefined}
          className="flex h-[34px] w-full cursor-pointer items-center gap-[10px] rounded-[8px] px-2 text-left outline-none select-none hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {entry.icon}
          <span className="min-w-0 truncate text-[12.5px] leading-none font-medium text-foreground">{entry.label}</span>
          {entry.attention === true ? (
            <span
              aria-hidden="true"
              className="ml-auto size-[7px] shrink-0 animate-pulse rounded-full bg-destructive motion-reduce:animate-none"
            />
          ) : entry.hotkey === undefined ? null : (
            <span className="ml-auto shrink-0 text-[11px] leading-none tracking-wide text-muted-foreground/80">{entry.hotkey}</span>
          )}
        </button>
      ))}
    </div>
  );
}

const QuickActionsRowMemo = React.memo(QuickActionsRow);
export { QuickActionsRowMemo as QuickActionsRow };
