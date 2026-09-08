import { copy } from '@/strings';
import { formatTokenCount } from '@/thread/format-count-unit';

/** 会话用量条目（仅本次运行内存中的活跃会话，无跨重启历史）。 */
type UsageEntry = {
  title: string
  projectName: string
  model: string
  tokensTotal: number
  cost: number
  messageCount: number
}

type UsageScreenProps = {
  entries: ReadonlyArray<UsageEntry>
  onClose: () => void
}

type ProjectGroup = {
  projectName: string
  /** 组内条目 tokens 合计。 */
  tokens: number
  items: ReadonlyArray<UsageEntry>
}

/** 按项目分组，保持首次出现顺序。 */
function groupByProject(entries: ReadonlyArray<UsageEntry>): ReadonlyArray<ProjectGroup> {
  const groups = new Map<string, { tokens: number; items: UsageEntry[] }>();
  for (const entry of entries) {
    const group = groups.get(entry.projectName) ?? { tokens: 0, items: [] };
    group.tokens += entry.tokensTotal;
    group.items.push(entry);
    groups.set(entry.projectName, group);
  }
  return [...groups].map(([projectName, group]) => ({ projectName, tokens: group.tokens, items: group.items }));
}

function sumTokens(entries: ReadonlyArray<UsageEntry>): number {
  return entries.reduce((sum, entry) => sum + entry.tokensTotal, 0);
}

function sumCost(entries: ReadonlyArray<UsageEntry>): number {
  return entries.reduce((sum, entry) => sum + entry.cost, 0);
}

/** 会话行右侧的等宽计数值：tokens / cost / messages。 */
function entryMetrics(entry: UsageEntry): ReadonlyArray<string> {
  return [formatTokenCount(entry.tokensTotal) ?? '0', `$${entry.cost.toFixed(2)}`, String(entry.messageCount)];
}

/** Usage 全屏页（I2）：汇总卡 + 按项目分组 + Top 会话；数据仅覆盖本次运行的活跃会话。 */
function UsageScreen({ entries, onClose }: UsageScreenProps) {
  const groups = groupByProject(entries);
  const topSessions = [...entries].sort((a, b) => b.tokensTotal - a.tokensTotal).slice(0, 5);
  const summaryCards: ReadonlyArray<{ label: string; value: string }> = [
    { label: copy.usage.totalTokens, value: formatTokenCount(sumTokens(entries)) ?? '0' },
    { label: copy.usage.totalCost, value: `$${sumCost(entries).toFixed(2)}` },
    { label: copy.usage.sessionsCount(entries.length), value: String(entries.length) },
  ];
  const isEmpty = entries.length === 0;
  return (
    <div className="fixed inset-0 z-40 bg-background">
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between px-[22px] py-[18px]">
          <p className="text-[13.5px] font-medium">{copy.usage.title}</p>
          <button type="button" onClick={onClose} className="cursor-pointer text-[12px] text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50">
            {copy.usage.close}
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto flex w-full max-w-[720px] flex-col gap-[20px] px-[28px] pb-[32px]">
            <div className="grid grid-cols-3 gap-[10px]">
              {summaryCards.map((card) => (
                <div key={card.label} className="rounded-[10px] border border-border px-[12px] py-[10px]">
                  <p className="truncate text-[11px] text-muted-foreground">{card.label}</p>
                  <p className="pt-[4px] truncate text-[15px] font-medium tabular-nums text-foreground">{card.value}</p>
                </div>
              ))}
            </div>
            {isEmpty ? (
              <div className="flex flex-col gap-[6px]">
                <p className="text-[12.5px] text-muted-foreground">{copy.usage.empty}</p>
                <p className="text-[11px] leading-[16px] text-muted-foreground/80">{copy.usage.liveOnlyHint}</p>
              </div>
            ) : (
              <>
                <section className="flex flex-col gap-[8px]">
                  <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-muted-foreground">{copy.usage.byProject}</p>
                  {groups.map((group) => (
                    <div key={group.projectName} className="overflow-hidden rounded-[10px] border border-border">
                      <div className="flex items-center justify-between gap-[12px] border-b border-border bg-muted/40 px-[12px] py-[8px]">
                        <span className="truncate text-[12.5px] font-medium text-foreground">{group.projectName}</span>
                        <span className="shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">
                          {formatTokenCount(group.tokens) ?? '0'}
                        </span>
                      </div>
                      <div className="divide-y divide-border">
                        {group.items.map((entry, index) => (
                          <div key={`${entry.title}:${index}`} className="flex items-center justify-between gap-[12px] px-[12px] py-[7px]">
                            <div className="flex min-w-0 items-baseline gap-[8px]">
                              <span className="truncate text-[12px] text-foreground/85">{entry.title}</span>
                              <span className="shrink-0 truncate text-[11px] text-muted-foreground">{entry.model}</span>
                            </div>
                            <div className="flex shrink-0 items-center gap-[10px] font-mono text-[11px] tabular-nums text-muted-foreground">
                              {entryMetrics(entry).map((metric, metricIndex) => (
                                <span key={metricIndex}>{metric}</span>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </section>
                <section className="flex flex-col gap-[8px]">
                  <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-muted-foreground">{copy.usage.topSessions}</p>
                  <div className="divide-y divide-border overflow-hidden rounded-[10px] border border-border">
                    {topSessions.map((entry, index) => (
                      <div key={`${entry.title}:${index}`} className="flex items-center justify-between gap-[12px] px-[12px] py-[7px]">
                        <div className="flex min-w-0 items-baseline gap-[8px]">
                          <span className="truncate text-[12px] text-foreground/85">{entry.title}</span>
                          <span className="shrink-0 truncate text-[11px] text-muted-foreground">{entry.projectName}</span>
                        </div>
                        <div className="flex shrink-0 items-center gap-[10px] font-mono text-[11px] tabular-nums text-muted-foreground">
                          <span>{formatTokenCount(entry.tokensTotal) ?? '0'}</span>
                          <span>${entry.cost.toFixed(2)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
                <p className="text-[11px] leading-[16px] text-muted-foreground">{copy.usage.liveOnlyHint}</p>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export { UsageScreen };
