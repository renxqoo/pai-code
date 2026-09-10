import { cn } from '@/lib/utils';

type MemoryLegendProps = {
  tone: 'app' | 'hub' | 'workers'
  label: string
  value: string
}

const segmentTone = {
  app: 'bg-dot-active',
  hub: 'bg-dot-done',
  workers: 'bg-spark',
} as const;

/** 内存图例项：系列色点 + 名称 + 数值（分段条下方三列）。 */
function MemoryLegend({ tone, label, value }: MemoryLegendProps) {
  return (
    <span className="flex min-w-0 flex-col gap-[3px]">
      <span className="flex items-center gap-[4px] text-[10.5px] leading-none whitespace-nowrap text-muted-foreground">
        <span aria-hidden="true" className={cn('size-[5px] shrink-0 rounded-full', segmentTone[tone])} />
        <span className="truncate">{label}</span>
      </span>
      <span className="pl-[9px] font-mono text-[11px] leading-none tabular-nums text-foreground">{value}</span>
    </span>
  );
}

export { MemoryLegend };
export type { MemoryLegendProps };
