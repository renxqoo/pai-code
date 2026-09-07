import { cn } from '@/lib/utils';

export type BannerTone = 'warn' | 'info';

type BannerStripProps = {
  tone: BannerTone;
  icon: React.ReactNode;
  children: React.ReactNode;
};

/** 提示条底座：图标 + 文案，宽度与输入卡对齐。 */
function BannerStrip({ tone, icon, children }: BannerStripProps) {
  const palette =
    tone === 'warn'
      ? 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400'
      : 'border-border bg-muted/50 text-muted-foreground';
  return (
    <div className={cn('mx-auto mb-[10px] flex w-full max-w-[700px] items-center gap-[8px] rounded-[10px] border px-[12px] py-[7px] text-[12px] leading-[18px]', palette)}>
      <span className="shrink-0">{icon}</span>
      <span className="min-w-0 flex-1">{children}</span>
    </div>
  );
}

export { BannerStrip };
