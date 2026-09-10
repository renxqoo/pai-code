import { copy } from '@/strings';
import { cn } from '@/lib/utils';
import { isWindowsPlatform, TITLEBAR_LEFT_PADDING } from '@/lib/platform';
import { healthLabel, type RuntimeHealthTone } from '@/screens/runtime-format';

type RuntimeHeaderProps = {
  health: RuntimeHealthTone
  onClose: () => void
}

const healthDotClass: Record<RuntimeHealthTone, string> = {
  healthy: 'bg-dot-done',
  degraded: 'bg-spark',
  failed: 'bg-destructive',
};

/** 页头：标题 + 健康灯 + 自动刷新指示 + 关闭；左右留出自绘标题栏/系统 caption 的几何。 */
function RuntimeHeader({ health, onClose }: RuntimeHeaderProps) {
  const attention = health !== 'healthy';
  return (
    <header
      className="flex h-[46px] shrink-0 items-center gap-[12px] border-b border-border pr-[22px] pl-[22px]"
      style={{
        paddingLeft: TITLEBAR_LEFT_PADDING,
        paddingRight: isWindowsPlatform ? 148 : 22,
      }}
    >
      <p className="text-[13.5px] font-medium">{copy.runtime.title}</p>
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
      <button
        type="button"
        onClick={onClose}
        className="cursor-pointer text-[12px] text-muted-foreground outline-none select-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        {copy.runtime.close}
      </button>
    </header>
  );
}

export { RuntimeHeader };
export type { RuntimeHeaderProps };
