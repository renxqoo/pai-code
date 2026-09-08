import { AlertTriangle } from 'lucide-react';

import { copy } from '@/strings';
import { BannerStrip } from '@/thread/banner-strip';

/**
 * 宿主未连接横幅：host 从未构建或已 failed 时置顶提示——
 * 区分「模型没配置」与「宿主没起来」，避免把宿主故障误导读进 Provider 设置。
 */
function HostDownBanner({ onOpenSettings }: { onOpenSettings: () => void }) {
  return (
    <BannerStrip tone="warn" icon={<AlertTriangle className="size-[13px]" strokeWidth={1.75} />}>
      <span>{copy.host.downBanner}</span>
      <button
        type="button"
        onClick={onOpenSettings}
        className="ml-[10px] shrink-0 cursor-pointer underline decoration-border underline-offset-2 outline-none hover:decoration-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        {copy.host.downAction}
      </button>
    </BannerStrip>
  );
}

export { HostDownBanner };
