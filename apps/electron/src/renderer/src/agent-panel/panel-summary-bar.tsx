import { formatCountUnit, StatusDot } from '@paiapp/ui';

import { copy } from '@/strings';
import type { PanelSummary } from '@/thread/panel-summary';

type PanelSummaryBarProps = {
  summary: PanelSummary
}

/** 面板底部状态栏：N working（或归档态汇总）+ Σ token 合计，随列表实时更新。 */
function PanelSummaryBar({ summary }: PanelSummaryBarProps) {
  const hasWorking = summary.busyCount > 0;
  const dotTone = hasWorking ? 'active' : summary.settledCount > 0 ? 'done' : 'idle';
  return (
    <div className="flex h-[30px] shrink-0 items-center gap-[10px] border-t border-border px-[14px]">
      <StatusDot tone={dotTone} className="size-[6px]" />
      {hasWorking ? (
        <span className="font-mono text-[11px] leading-none tabular-nums text-link">
          {copy.flow.panelWorking(summary.busyCount)}
        </span>
      ) : null}
      {summary.settledCount > 0 ? (
        <span className="font-mono text-[11px] leading-none tabular-nums text-muted-foreground">
          {copy.flow.panelSettled(summary.settledCount)}
        </span>
      ) : null}
      <span className="ml-auto font-mono text-[11px] leading-none tabular-nums text-muted-foreground">
        {copy.flow.footerTokens(formatCountUnit(summary.totalTokens))}
      </span>
    </div>
  );
}

export { PanelSummaryBar };
