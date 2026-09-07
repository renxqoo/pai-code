import { AlertTriangle, Layers, RefreshCw } from 'lucide-react';

import { copy } from '@/strings';
import { BannerStrip } from './banner-strip';

type ThreadBannerProps = {
  crashed: boolean;
  compacting: boolean;
  retrying: { attempt: number; maxAttempts: number } | null;
  queueCount: number;
};

/**
 * 会话状态横幅：worker 崩溃恢复提示 / 压缩中 / 自动重试 / 排队消息数。
 * 输入卡上方的轻量提示条，无状态时整行不占位。
 */
function ThreadBanner({ crashed, compacting, retrying, queueCount }: ThreadBannerProps) {
  if (crashed) {
    return (
      <BannerStrip tone="warn" icon={<AlertTriangle className="size-[13px]" strokeWidth={1.75} />}>
        {copy.flow.crashedBanner}
      </BannerStrip>
    );
  }
  if (compacting) {
    return (
      <BannerStrip tone="info" icon={<RefreshCw className="size-[13px] animate-spin" strokeWidth={1.75} />}>
        {copy.flow.compacting}
      </BannerStrip>
    );
  }
  if (retrying !== null) {
    return (
      <BannerStrip tone="info" icon={<RefreshCw className="size-[13px]" strokeWidth={1.75} />}>
        {copy.flow.retrying(retrying.attempt, retrying.maxAttempts)}
      </BannerStrip>
    );
  }
  if (queueCount > 0) {
    return (
      <BannerStrip tone="info" icon={<Layers className="size-[13px]" strokeWidth={1.75} />}>
        {copy.flow.queued(queueCount)}
      </BannerStrip>
    );
  }
  return null;
}

export { ThreadBanner };
