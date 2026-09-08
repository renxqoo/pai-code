import { AlertTriangle, Layers, RefreshCw, TerminalSquare } from 'lucide-react';

import { copy } from '@/strings';
import { BannerStrip } from './banner-strip';

type ThreadBannerProps = {
  crashed: boolean;
  compacting: boolean;
  retrying: { attempt: number; maxAttempts: number } | null;
  queueCount: number;
  /** 直执行 bash 在途与其流式输出尾部（截断展示一行）。 */
  bashRunning: boolean;
  bashTail: string;
  /** 排队行点击展开面板（不传则纯展示）。 */
  onToggleQueue?: () => void
};

/**
 * 会话状态横幅：worker 崩溃恢复提示 / 压缩中 / 直执行命令 / 自动重试 / 排队消息数。
 * 输入卡上方的轻量提示条，无状态时整行不占位。
 */
function ThreadBanner({ crashed, compacting, retrying, queueCount, bashRunning, bashTail, onToggleQueue }: ThreadBannerProps) {
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
  if (bashRunning) {
    const tail = bashTail.replaceAll('\n', ' ').trim();
    return (
      <BannerStrip tone="info" icon={<TerminalSquare className="size-[13px]" strokeWidth={1.75} />}>
        {tail.length > 0 ? `${copy.flow.bashRunning} ${tail.slice(-120)}` : copy.flow.bashRunning}
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
    const content = <span>{copy.flow.queued(queueCount)}</span>;
    if (onToggleQueue === undefined) {
      return (
        <BannerStrip tone="info" icon={<Layers className="size-[13px]" strokeWidth={1.75} />}>
          {content}
        </BannerStrip>
      );
    }
    return (
      <BannerStrip tone="info" icon={<Layers className="size-[13px]" strokeWidth={1.75} />}>
        <button type="button" onClick={onToggleQueue} className="cursor-pointer text-left underline decoration-border underline-offset-2 hover:decoration-foreground">
          {content}
        </button>
      </BannerStrip>
    );
  }
  return null;
}

export { ThreadBanner };
