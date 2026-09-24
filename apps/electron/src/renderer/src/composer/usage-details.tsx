import type * as React from 'react';
import type { TokenAnalyticsView } from '@paiapp/contracts';

import { copy } from '@/strings';
import { formatTokenCount } from '@/thread/format-count-unit';

type UsageDetailsProps = {
  /** 上下文分析（T43）；null = 插件缺席/未拉取——不渲染弹层。 */
  analytics: TokenAnalyticsView | null;
};

function rowsOf(rows: ReadonlyArray<[string, string]>): React.JSX.Element[] {
  return rows.map(([label, value]) => (
    <div key={label} className="flex items-center justify-between px-[10px] py-[3px]">
      <span className="text-[11px] text-muted-foreground/80">{label}</span>
      <span className="font-mono text-[11px] tabular-nums text-foreground">{value}</span>
    </div>
  ));
}

/** 用量明细弹层（T43 上下文段）：构成分项估算 + 剩余/窗口 + 缓存观测——
 *  与实报占用分开命名，段尾注明估算口径；累计段已下线（双口径不同屏）。 */
function UsageDetails({ analytics }: UsageDetailsProps) {
  if (analytics === null) return null;
  const context: ReadonlyArray<[string, string]> = [
    [copy.usage.systemPromptLabel, formatTokenCount(analytics.systemPrompt) ?? '0'],
    [copy.usage.toolsLabel, formatTokenCount(analytics.tools) ?? '0'],
    [copy.usage.contextMessagesLabel, formatTokenCount(analytics.messages) ?? '0'],
    [copy.usage.freeSpaceLabel, formatTokenCount(analytics.remaining) ?? '0'],
    [copy.usage.windowLabel, formatTokenCount(analytics.window) ?? '0'],
    [copy.usage.cacheHitLabel, `${Math.round(analytics.cacheHitRate * 100)}%`],
    [copy.usage.cacheReadLabel, formatTokenCount(analytics.totalCacheRead) ?? '0'],
    [copy.usage.cacheWriteLabel, formatTokenCount(analytics.totalCacheWrite) ?? '0'],
  ];
  return (
    <div className="absolute right-0 bottom-full z-10 mb-[6px] w-[228px] rounded-[10px] border border-border bg-background py-[6px] shadow-[0_10px_28px_-14px_rgba(24,24,28,0.4)]">
      <p className="px-[10px] pt-[3px] pb-[1px] text-[10.5px] font-medium text-muted-foreground/70">
        {copy.usage.contextTitle} · {copy.usage.contextUsed(formatTokenCount(analytics.used) ?? '0', formatTokenCount(analytics.window) ?? '0')}
      </p>
      {rowsOf(context)}
      <p className="px-[10px] py-[2px] text-[10px] leading-[13px] text-muted-foreground/60">{copy.usage.estimateNote}</p>
    </div>
  );
}

export { UsageDetails };
