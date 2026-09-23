import * as React from 'react';
import { AlertTriangle, RefreshCw, TerminalSquare } from 'lucide-react';
import { useStore } from 'zustand';

import { copy } from '@/strings';
import { initialThreadState } from '@/live/live-thread-state';
import { store as liveStore } from '@/live/workspace-runtime';
import { BannerStrip } from './banner-strip';

/**
 * 会话状态横幅（T34 M1 自订阅，0 props）：worker 崩溃恢复提示 / 压缩中 / 直执行
 * 命令 / 自动重试——全部来自 live store 活跃线程运行态。
 * 输入卡上方的轻量提示条，无状态时整行不占位。
 */
function ThreadBanner(): React.JSX.Element | null {
  const thread = useStore(liveStore, (s) => (s.activeThreadId === null ? undefined : s.threads[s.activeThreadId]));
  const { crashed, compacting, retrying, bashRunning, bashTail } = thread ?? initialThreadState;
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
      <BannerStrip tone="info" icon={<RefreshCw className="size-[13px] animate-spin" strokeWidth={1.75} />}>
        {copy.flow.retrying(retrying.attempt)}
      </BannerStrip>
    );
  }
  return null;
}

const ThreadBannerMemo = React.memo(ThreadBanner);
export { ThreadBannerMemo as ThreadBanner };
