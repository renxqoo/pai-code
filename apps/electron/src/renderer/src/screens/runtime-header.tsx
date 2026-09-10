import { copy } from '@/strings';
import { cn } from '@/lib/utils';
import { healthLabel, type RuntimeHealthTone } from '@/screens/runtime-format';

type RuntimeHeaderProps = {
  health: RuntimeHealthTone
}

const healthDotClass: Record<RuntimeHealthTone, string> = {
  healthy: 'bg-dot-done',
  degraded: 'bg-spark',
  failed: 'bg-destructive',
};

/** 内容首行：健康灯 + 自动刷新指示（分区标题由 SettingsPageHeader 承担）。 */
function RuntimeHeader({ health }: RuntimeHeaderProps) {
  const attention = health !== 'healthy';
  return (
    <header className="flex h-[34px] shrink-0 items-center gap-[10px] rounded-lg border border-border px-[12px]">
      <span
        role="status"
        aria-label={copy.runtime.healthLabel}
        className={cn(
          'inline-flex items-center gap-[6px] rounded-full border border-border px-[9px] py-[3px] text-[11px] leading-none font-medium select-none',
          health === 'failed' ? 'text-destructive' : attention ? 'text-spark' : 'text-dot-done',
        )}
      >
        <span
          aria-hidden="true"
          className={cn('size-[7px] rounded-full', healthDotClass[health], attention && 'animate-pulse motion-reduce:animate-none')}
        />
        {healthLabel(health)}
      </span>
      <span className="ml-auto flex items-center gap-[7px] text-[11px] leading-none text-muted-foreground">
        <span aria-hidden="true" className="relative flex size-[6px]">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-dot-active opacity-60 motion-reduce:animate-none" />
          <span className="relative inline-flex size-[6px] rounded-full bg-dot-active" />
        </span>
        {copy.runtime.autoRefresh}
      </span>
    </header>
  );
}

export { RuntimeHeader };
export type { RuntimeHeaderProps };
