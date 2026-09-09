import { CONVERSATION_COLUMN_CLASS } from '@/thread/conversation-column';
import { cn } from '@/lib/utils';

export type BannerTone = 'warn' | 'info';

type BannerStripProps = {
  tone: BannerTone;
  icon: React.ReactNode;
  children: React.ReactNode;
};

/** 提示条底座：图标 + 文案，宽度与输入卡对齐。底色为不透明混色（叠主题底色），
 * 输入浮层透明化后内容从条后穿过不得透字。 */
function BannerStrip({ tone, icon, children }: BannerStripProps) {
  const palette =
    tone === 'warn'
      ? 'border-amber-500/30 bg-[color-mix(in_srgb,var(--color-amber-500)_10%,var(--background))] text-amber-700 dark:text-amber-400'
      : 'border-border bg-[color-mix(in_srgb,var(--muted)_50%,var(--background))] text-muted-foreground';
  return (
    <div className={cn(CONVERSATION_COLUMN_CLASS, 'pointer-events-auto mb-[10px] flex items-center gap-[8px] rounded-[10px] border px-[12px] py-[7px] text-[12.5px] leading-[19px]', palette)}>
      <span className="shrink-0">{icon}</span>
      <span className="min-w-0 flex-1">{children}</span>
    </div>
  );
}

export { BannerStrip };
