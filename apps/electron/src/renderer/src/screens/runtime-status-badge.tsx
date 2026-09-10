import { Pin } from 'lucide-react';

import { Spinner } from '@paiapp/ui';
import type { WorkerRowView } from '@paiapp/contracts';

import { cn } from '@/lib/utils';
import { copy } from '@/strings';

type RuntimeStatusBadgeProps = {
  state: WorkerRowView['state']
  isStreaming: boolean
  keepalive: boolean
}

const badgeClass =
  'inline-flex h-[20px] shrink-0 items-center gap-[5px] rounded-full px-[8px] text-[11px] leading-none font-medium whitespace-nowrap select-none';

const dotClass = 'size-[6px] shrink-0 rounded-full';

/** Worker 状态徽章：执行中（spinner）＞ 常驻（pin）＞ 空闲 / 已归档 / 异常。 */
function RuntimeStatusBadge({ state, isStreaming, keepalive }: RuntimeStatusBadgeProps) {
  if (state === 'dead') {
    return (
      <span className={cn(badgeClass, 'bg-destructive/10 text-destructive')}>
        <span aria-hidden="true" className={dotClass} />
        {copy.runtime.dead}
      </span>
    );
  }
  if (state === 'parked') {
    return (
      <span className={cn(badgeClass, 'bg-muted text-muted-foreground')}>
        <span aria-hidden="true" className={dotClass} />
        {copy.runtime.parked}
      </span>
    );
  }
  if (isStreaming) {
    return (
      <span className={cn(badgeClass, 'bg-dot-active/10 text-dot-active')}>
        <Spinner className="size-[11px]" />
        {copy.runtime.executing}
      </span>
    );
  }
  if (keepalive) {
    return (
      <span className={cn(badgeClass, 'bg-spark/10 text-spark')}>
        <Pin aria-hidden="true" className="size-[11px] rotate-45" strokeWidth={1.75} />
        {copy.runtime.keepaliveOn}
      </span>
    );
  }
  return (
    <span className={cn(badgeClass, 'bg-dot-done/10 text-dot-done')}>
      <span aria-hidden="true" className={dotClass} />
      {copy.runtime.idle}
    </span>
  );
}

export { RuntimeStatusBadge };
export type { RuntimeStatusBadgeProps };
