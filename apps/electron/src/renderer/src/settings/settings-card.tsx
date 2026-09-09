import type * as React from 'react';

import { cn } from '@/lib/utils';

type SettingsCardProps = React.ComponentProps<'div'>;

/** 设置卡片容器：白卡面 + 描边圆角；行式内容用 divide-y 分隔，深浅色经 token 自适应。 */
function SettingsCard({ className, ...props }: SettingsCardProps) {
  return <div className={cn('rounded-xl border border-border bg-card', className)} {...props} />;
}

export { SettingsCard };
