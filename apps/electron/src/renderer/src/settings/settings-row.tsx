import type * as React from 'react';

import { cn } from '@/lib/utils';

type SettingsRowProps = {
  title: string
  description?: string
  /** 行尾控件（开关/分段/下拉等） */
  children: React.ReactNode
  className?: string
}

/** 卡片内设置行：左标题+描述、右控件；分隔线由外层卡片 divide-y 提供。 */
function SettingsRow({ title, description, children, className }: SettingsRowProps) {
  return (
    <div className={cn('flex items-center justify-between gap-[24px] px-[20px] py-[13px]', className)}>
      <div className="min-w-0">
        <p className="text-[13px] leading-[18px] font-medium text-foreground">{title}</p>
        {description === undefined ? null : (
          <p className="mt-[2px] text-[12px] leading-[17px] text-muted-foreground">{description}</p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-[8px]">{children}</div>
    </div>
  );
}

export { SettingsRow };
