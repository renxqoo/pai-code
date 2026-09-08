import type { SessionStatsView } from '@paiapp/contracts';

import { formatTokenCount } from '@/thread/format-count-unit';

type UsageDetailsProps = {
  stats: SessionStatsView
}

/** 用量明细弹层（I1）：上下文占比 + tokens/cost/消息/工具调用。 */
function UsageDetails({ stats }: UsageDetailsProps) {
  const rows: ReadonlyArray<[string, string]> = [
    ['context', stats.contextUsage === null ? '—' : `${Math.round(stats.contextUsage * 100)}%`],
    ['tokens', formatTokenCount(stats.tokensTotal) ?? '0'],
    ['cost', stats.cost > 0 ? `$${stats.cost.toFixed(2)}` : '—'],
    ['messages', `${stats.userMessages} + ${stats.assistantMessages}`],
    ['tool calls', String(stats.toolCalls)],
  ];
  return (
    <div className="absolute right-0 bottom-full z-10 mb-[6px] w-[200px] rounded-[10px] border border-border bg-background py-[6px] shadow-[0_10px_28px_-14px_rgba(24,24,28,0.4)]">
      {rows.map(([label, value]) => (
        <div key={label} className="flex items-center justify-between px-[10px] py-[3px]">
          <span className="text-[11px] text-muted-foreground/80">{label}</span>
          <span className="font-mono text-[11px] tabular-nums text-foreground">{value}</span>
        </div>
      ))}
    </div>
  );
}

export { UsageDetails };
