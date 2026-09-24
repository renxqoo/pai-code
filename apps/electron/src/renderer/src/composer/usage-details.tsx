import type * as React from 'react';
import type { TokenAnalyticsView } from '@paiapp/contracts';

import { copy } from '@/strings';

type UsageDetailsProps = {
  /** 上下文分析（T43）；null = 插件缺席/未拉取——不渲染弹层。 */
  analytics: TokenAnalyticsView | null;
};

/** 占窗口比：token 一律换算成窗口百分比展示（一位小数；窗口缺失/非法退 0%）。 */
export function formatWindowPct(value: number, window: number): string {
  if (!Number.isFinite(value) || !Number.isFinite(window) || window <= 0) return '0%';
  return `${Math.round((value / window) * 1000) / 10}%`;
}

function rowsOf(rows: ReadonlyArray<[string, string]>): React.JSX.Element[] {
  return rows.map(([label, value]) => (
    <div key={label} className="flex items-center justify-between px-[10px] py-[3px]">
      <span className="text-[11px] text-muted-foreground/80">{label}</span>
      <span className="font-mono text-[11px] tabular-nums text-foreground">{value}</span>
    </div>
  ));
}

/** 用量明细弹层（T43 上下文段）：分项/剩余/窗口一律按占窗口百分比展示 + 缓存观测；
 *  累计段暂以注释保留不展示（双口径不混排，Codex #3630 混淆教训），恢复时取消注释即可。 */
function UsageDetails({ analytics }: UsageDetailsProps) {
  if (analytics === null) return null;
  const context: ReadonlyArray<[string, string]> = [
    [copy.usage.systemPromptLabel, formatWindowPct(analytics.systemPrompt, analytics.window)],
    [copy.usage.toolsLabel, formatWindowPct(analytics.tools, analytics.window)],
    [copy.usage.contextMessagesLabel, formatWindowPct(analytics.messages, analytics.window)],
    [copy.usage.freeSpaceLabel, formatWindowPct(analytics.remaining, analytics.window)],
    [copy.usage.windowLabel, formatWindowPct(analytics.window, analytics.window)],
    [copy.usage.cacheHitLabel, `${Math.round(analytics.cacheHitRate * 100)}%`],
    // 累计段暂不展示（只改 UI，数值仍在契约里；恢复时取消注释）：
    // [copy.usage.cacheReadLabel, formatTokenCount(analytics.totalCacheRead) ?? '0'],
    // [copy.usage.cacheWriteLabel, formatTokenCount(analytics.totalCacheWrite) ?? '0'],
  ];
  return (
    <div className="absolute right-0 bottom-full z-10 mb-[6px] w-[228px] rounded-[10px] border border-border bg-background py-[6px] shadow-[0_10px_28px_-14px_rgba(24,24,28,0.4)]">
      <p className="px-[10px] pt-[3px] pb-[1px] text-[10.5px] font-medium text-muted-foreground/70">
        {copy.usage.contextTitle} · {copy.usage.contextUsed(formatWindowPct(analytics.used, analytics.window))}
      </p>
      {rowsOf(context)}
    </div>
  );
}

export { UsageDetails };
