import type * as React from 'react';

import type { Usage } from '@paiapp/contracts';

import { copy } from '@/strings';

/** 上下文用量视图（实时计算，来自事件流——不是拉取快照）。
 *  used = 最近一次 LLM 实报 input；window = 内核实拨窗口（两者皆真值）。 */
export type LiveUsageView = {
  used: number;
  window: number;
};

type UsageDetailsProps = {
  /** 实时用量；null = 尚无实报或无窗口——不渲染弹层（不摆假数据面）。 */
  live: LiveUsageView | null;
  /** 缓存命中率分子分母（实报 cacheRead / input；无实报退 null 不显示）。 */
  cache: { read: number; input: number } | null;
};

/** 占窗口比：token 换算成窗口百分比（一位小数）。窗口非法退 '—'——
 *  不显 0%（0% 是假值，会被读成「真满了」）。 */
export function formatWindowPct(value: number, window: number): string {
  if (!Number.isFinite(value) || !Number.isFinite(window) || window <= 0) return '—';
  return `${Math.round((value / window) * 1000) / 10}%`;
}

/** 由实时 usage + 窗口派生展示用量（窗口缺失 → null：无分母不算百分比）。 */
export function liveUsageOf(usage: Usage | null, window: number | null): LiveUsageView | null {
  if (usage === null || window === null || !Number.isFinite(window) || window <= 0) return null;
  return { used: usage.input, window };
}

function rowsOf(rows: ReadonlyArray<[string, string]>): React.JSX.Element[] {
  return rows.map(([label, value]) => (
    <div key={label} className="flex items-center justify-between px-[10px] py-[3px]">
      <span className="text-[11px] text-muted-foreground/80">{label}</span>
      <span className="font-mono text-[11px] tabular-nums text-foreground">{value}</span>
    </div>
  ));
}

/** 用量明细弹层：只列真值行（剩余/窗口/缓存命中率）。
 *  估算分项（系统提示词/工具/消息）已删——那些是「实报 − 两估」的残差，
 *  估算和超实报时被钳成 0，与占用自相矛盾；估算归 token-meter，不进展示层。 */
function UsageDetails({ live, cache }: UsageDetailsProps) {
  if (live === null) return null;
  const remaining = Math.max(0, live.window - live.used);
  const rows: ReadonlyArray<[string, string]> = [
    [copy.usage.freeSpaceLabel, formatWindowPct(remaining, live.window)],
    [copy.usage.windowLabel, formatWindowPct(live.window, live.window)],
    ...(cache !== null && cache.input > 0
      ? ([[copy.usage.cacheHitLabel, `${Math.round((cache.read / cache.input) * 100)}%`]] as ReadonlyArray<[string, string]>)
      : []),
  ];
  return (
    <div className="absolute right-0 bottom-full z-10 mb-[6px] w-[228px] rounded-[10px] border border-border bg-background py-[6px] shadow-[0_10px_28px_-14px_rgba(24,24,28,0.4)]">
      <p className="px-[10px] pt-[3px] pb-[1px] text-[10.5px] font-medium text-muted-foreground/70">
        {copy.usage.contextTitle} · {copy.usage.contextUsed(formatWindowPct(live.used, live.window))}
      </p>
      {rowsOf(rows)}
    </div>
  );
}

export { UsageDetails };
