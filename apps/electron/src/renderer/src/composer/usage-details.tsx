import type { SessionStatsView } from '@paiapp/contracts';

import { copy } from '@/strings';
import { formatTokenCount } from '@/thread/format-count-unit';

type UsageDetailsProps = {
  stats: SessionStatsView
}

/** 用量明细弹层（I1）：tokens 输入/输出/合计 + cost + 消息数 + 工具调用数。 */
function UsageDetails({ stats }: UsageDetailsProps) {
  const rows: ReadonlyArray<[string, string]> = [
    [copy.usage.inputTokens, formatTokenCount(stats.tokens.input) ?? '0'],
    [copy.usage.outputTokens, formatTokenCount(stats.tokens.output) ?? '0'],
    [copy.usage.tokensLabel, formatTokenCount(stats.tokens.total) ?? '0'],
    [copy.usage.costLabel, stats.cost > 0 ? `$${stats.cost.toFixed(2)}` : '—'],
    [copy.usage.messagesLabel, `${stats.userMessages} + ${stats.assistantMessages}`],
    [copy.usage.toolCallsLabel, String(stats.toolCalls)],
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
