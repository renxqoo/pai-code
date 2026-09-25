import { MoreHorizontal, Pin, PinOff } from 'lucide-react';

import { formatTokenCount, IconButton, MenuButton, type MenuItemDef } from '@paiapp/ui';

import { copy } from '@/strings';
import { cn } from '@/lib/utils';
import type { RuntimeWorkerRow } from '@/screens/runtime-entries';
import { formatBytes, idleLabel, isRecyclableIdle, recycleCountdownLabel } from '@/screens/runtime-format';
import { RuntimeStatusBadge } from '@/screens/runtime-status-badge';

type RuntimeWorkerRowProps = {
  row: RuntimeWorkerRow
  onStop: (threadId: string) => void
  onRetire: (threadId: string) => void
  onForceRetire: (threadId: string) => void
  onToggleKeepalive: (threadId: string, keepalive: boolean) => void
  onOpenSession: (threadId: string) => void
}

const cellClass = 'px-[8px] py-[8px] align-middle';
const numericClass = 'font-mono text-[11.5px] leading-none tabular-nums text-muted-foreground';
const actionButtonClass =
  'flex h-[24px] cursor-pointer items-center rounded-[6px] border border-border px-[9px] text-[11px] leading-none text-foreground outline-none select-none hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-40';

/** Worker 表行：会话身份 + 状态徽章 + 空闲/回收倒计时 + 计量列 + 行操作（停止/回收/常驻/菜单）。 */
function RuntimeWorkerRow({ row, onStop, onRetire, onForceRetire, onToggleKeepalive, onOpenSession }: RuntimeWorkerRowProps) {
  const liveIdle = isRecyclableIdle(row);
  return (
    <tr data-state={row.state} className="border-b border-border/60 transition-colors last:border-b-0 hover:bg-accent/40 motion-reduce:transition-none">
      <td className={cn(cellClass, 'min-w-[160px]')}>
        <div className="flex min-w-0 flex-col gap-[3px]">
          <span className="truncate text-[12px] leading-none font-medium text-foreground">{row.title}</span>
          <span className="truncate text-[10.5px] leading-none text-muted-foreground">{projectNameOf(row)}</span>
        </div>
      </td>
      <td className={cellClass}>
        <RuntimeStatusBadge state={row.state} isStreaming={row.isStreaming} keepalive={row.keepalive} />
      </td>
      <td className={cn(cellClass, 'w-[104px]')}>
        <div className="flex min-w-0 flex-col gap-[3px]">
          <span className={numericClass}>{row.state === 'live' ? idleLabel(row.idleMs) : '—'}</span>
          {row.recycleInMs === null ? (
            <span className={cn(numericClass, row.state === 'live' ? '' : 'opacity-0')}>{copy.runtime.manual}</span>
          ) : (
            <span className={cn(numericClass, row.recycleInMs < 60_000 ? 'text-destructive' : 'text-spark')}>
              {recycleCountdownLabel(row.recycleInMs)}
            </span>
          )}
        </div>
      </td>
      <td className={cn(cellClass, 'max-w-[120px]')}>
        <span className={cn(numericClass, 'block truncate')}>{row.model ?? '—'}</span>
      </td>
      <td className={cn(cellClass, 'w-[52px] text-right')}>
        <span className={numericClass}>{row.queueCount > 0 ? row.queueCount : '—'}</span>
      </td>
      <td className={cn(cellClass, 'w-[56px] text-right')}>
        <span className={numericClass}>{formatTokenCount(row.stats?.tokens.total ?? null) ?? '—'}</span>
      </td>
      <td className={cn(cellClass, 'w-[72px] text-right')}>
        <span className={numericClass}>{formatBytes(row.rssBytes)}</span>
      </td>
      <td className={cn(cellClass, 'w-[118px]')}>
        <div className="flex items-center justify-end gap-[4px]">
          {row.isStreaming ? (
            <button type="button" onClick={() => onStop(row.threadId)} className={cn(actionButtonClass, 'text-destructive hover:bg-destructive/10')}>
              {copy.runtime.actionStop}
            </button>
          ) : row.state === 'live' ? (
            <>
              <button type="button" onClick={() => onRetire(row.threadId)} disabled={!liveIdle} className={actionButtonClass}>
                {copy.runtime.actionRecycle}
              </button>
              <IconButton
                label={row.keepalive ? copy.runtime.keepaliveOff : copy.runtime.keepaliveOn}
                size="xs"
                onClick={() => onToggleKeepalive(row.threadId, !row.keepalive)}
              >
                {row.keepalive ? <PinOff className="text-spark" strokeWidth={1.75} /> : <Pin strokeWidth={1.75} />}
              </IconButton>
            </>
          ) : null}
          <MenuButton
            aria-label={copy.runtime.rowMenu}
            align="end"
            popupMinWidth={140}
            trigger={<MoreHorizontal className="size-[14px]" strokeWidth={1.75} />}
            triggerClassName="flex size-6 cursor-pointer items-center justify-center rounded-[6px] text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
            items={menuItems(row)}
            onSelect={(id) => {
              if (id === 'open') onOpenSession(row.threadId);
              else if (id === 'force') onForceRetire(row.threadId);
              else if (id === 'keepalive') onToggleKeepalive(row.threadId, !row.keepalive);
            }}
          />
        </div>
      </td>
    </tr>
  );
}

function menuItems(row: RuntimeWorkerRow): readonly MenuItemDef[] {
  return [
    { kind: 'item', id: 'open', label: copy.runtime.actionOpen, disabled: row.state === 'dead' },
    { kind: 'separator' },
    { kind: 'item', id: 'force', label: copy.runtime.actionForceRecycle },
  ];
}

function projectNameOf(row: RuntimeWorkerRow): string {
  const parts = row.cwd.split('/').filter((part) => part.length > 0);
  return parts.at(-1) ?? row.cwd;
}

export { RuntimeWorkerRow };
export type { RuntimeWorkerRowProps };
