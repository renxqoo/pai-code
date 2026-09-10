import type * as React from 'react';

import { cn } from '@/lib/utils';

type RuntimeMetaRowProps = {
  label: string
  children: React.ReactNode
  className?: string
}

/** 卡内元信息行：左弱色标签、右等宽数值（右对齐、截断）。 */
function RuntimeMetaRow({ label, children, className }: RuntimeMetaRowProps) {
  return (
    <div className={cn('flex items-center justify-between gap-[12px] py-[5.5px]', className)}>
      <span className="shrink-0 text-[11.5px] leading-none text-muted-foreground">{label}</span>
      <span className="min-w-0 truncate text-right font-mono text-[11.5px] leading-none tabular-nums text-foreground">{children}</span>
    </div>
  );
}

export { RuntimeMetaRow };
export type { RuntimeMetaRowProps };
