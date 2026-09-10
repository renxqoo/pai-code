import type * as React from 'react';

import { cn } from '@/lib/utils';

type RuntimeCardProps = {
  title: string
  /** 标题行右侧的控件（图例/按钮等） */
  action?: React.ReactNode
  children: React.ReactNode
  className?: string
  /** 内容区追加类（如表格卡的横向滚动）。 */
  contentClassName?: string
}

/** 监控页卡片壳：小标题行 + 内容区；总览三卡/走势/表/诊断区共用同一外形。 */
function RuntimeCard({ title, action, children, className, contentClassName }: RuntimeCardProps) {
  return (
    <section className={cn('flex min-w-0 flex-col rounded-[12px] border border-border bg-card', className)}>
      <div className="flex shrink-0 items-center justify-between gap-[8px] px-[14px] pt-[12px] pb-[8px]">
        <p className="truncate text-[11px] leading-none font-medium tracking-[0.06em] uppercase text-muted-foreground">{title}</p>
        {action}
      </div>
      <div className={cn('min-h-0 flex-1 px-[14px] pb-[12px]', contentClassName)}>{children}</div>
    </section>
  );
}

export { RuntimeCard };
export type { RuntimeCardProps };
