import type * as React from 'react';

import type { Usage } from '@x3code/contracts';

import { copy } from '@/strings';

/** 上下文用量视图（实时计算，来自事件流——不是拉取快照）。
 *  used = 最近一次 LLM 实报 input；window = 模型目录的上下文窗口（两者皆真值）。 */
export type LiveUsageView = {
  used: number;
  window: number;
};

type UsageDetailsProps = {
  /** 实时用量；null = 尚无实报或无窗口——不渲染弹层（不摆假数据面）。 */
  live: LiveUsageView | null;
  /** 缓存命中率分子分母（实报 cacheRead / input；无实报退 null 不显示）。 */
  cache: { read: number; input: number } | null;
  /** 占用构成的两个静态分量（会话级拉取）；null = 未拉到，三行不渲染。 */
  composition: { systemPrompt: number; tools: number } | null;
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

/** 占用构成三行：系统提示词/工具为**静态分量**（hub 目录侧提供），
 *  消息 = 实报占用 − 前两项（展示层实时派生）。
 *
 *  为何消息不由 hub 给：那样它是「占用 − 两估」的残差，两估之和超实报时会被钳成 0，
 *  与占用自相矛盾（旧「已用 5.6% / 消息 0%」的成因）。改为此处派生后三行恒满足
 *  系统提示词 + 工具 + 消息 = 占用，夹紧只发生在占用本身小于两估之和的罕见情形。 */
export function compositionRows(
  live: LiveUsageView,
  composition: { systemPrompt: number; tools: number } | null,
): ReadonlyArray<[string, string]> {
  if (composition === null) return [];
  const messages = Math.max(0, live.used - composition.systemPrompt - composition.tools);
  return [
    [copy.usage.systemPromptLabel, formatWindowPct(composition.systemPrompt, live.window)],
    [copy.usage.toolsLabel, formatWindowPct(composition.tools, live.window)],
    [copy.usage.contextMessagesLabel, formatWindowPct(messages, live.window)],
  ];
}

function rowsOf(rows: ReadonlyArray<[string, string]>): React.JSX.Element[] {
  return rows.map(([label, value]) => (
    <div key={label} className="flex items-center justify-between px-[10px] py-[3px]">
      <span className="text-[11px] text-muted-foreground/80">{label}</span>
      <span className="font-mono text-[11px] tabular-nums text-foreground">{value}</span>
    </div>
  ));
}

/** 用量明细弹层：占用构成三行（系统提示词/工具/消息）+ 剩余空间 + 窗口 + 缓存命中率，
 *  一律占窗口百分比。分项为估算口径但不再标注文案——整块同一口径（百分比）呈现。 */
function UsageDetails({ live, cache, composition }: UsageDetailsProps) {
  if (live === null) return null;
  const remaining = Math.max(0, live.window - live.used);
  const rows: ReadonlyArray<[string, string]> = [
    ...compositionRows(live, composition),
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
