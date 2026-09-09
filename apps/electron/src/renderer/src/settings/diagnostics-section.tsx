import { RefreshCw } from 'lucide-react';

import type { WorkspaceDiagnostics } from '@/live/workspace-actions';
import { IconButton, StatusDot } from '@paiapp/ui';

import { copy } from '@/strings';

import { SettingsCard } from './settings-card';
import { SettingsPageHeader } from './settings-page-header';

type DiagnosticsSectionProps = {
  /** null = 尚未加载（显示空态）。 */
  data: WorkspaceDiagnostics | null
  onRefresh: () => void
  onRestartHost: () => void
}

/** Diagnostics 分区：host 相位 / 注册表会话数状态卡 + stderr 尾部代码块 + 刷新与危险重启。 */
function DiagnosticsSection({ data, onRefresh, onRestartHost }: DiagnosticsSectionProps) {
  return (
    <section>
      <SettingsPageHeader title={copy.settings.diagnosticsTitle} description={copy.settings.diagnosticsDesc} />
      <div className="flex flex-col gap-[16px]">
        <div className="flex justify-end">
          <IconButton label={copy.settings.refresh} onClick={onRefresh}>
            <RefreshCw strokeWidth={1.75} />
          </IconButton>
        </div>
        {data === null ? (
          <p className="text-[12.5px] leading-[18px] text-muted-foreground">{copy.settings.diagnosticsEmpty}</p>
        ) : (
          <>
            <SettingsCard className="divide-y divide-border">
              <div className="flex items-center justify-between gap-[12px] px-[20px] py-[12px]">
                <span className="text-[12px] leading-[17px] text-muted-foreground">{copy.settings.diagnosticsPhase}</span>
                <span className="flex shrink-0 items-center gap-[6px]">
                  <StatusDot
                    tone={data.hostPhase === 'ready' ? 'done' : 'idle'}
                    className={data.hostPhase === 'failed' ? 'bg-stop' : undefined}
                  />
                  <span className="font-mono text-[12px] leading-[17px] text-foreground">{data.hostPhase ?? '—'}</span>
                </span>
              </div>
              <div className="flex items-center justify-between gap-[12px] px-[20px] py-[12px]">
                <span className="text-[12px] leading-[17px] text-muted-foreground">{copy.settings.diagnosticsRegistry}</span>
                <span className="shrink-0 font-mono text-[12px] leading-[17px] tabular-nums text-foreground">{data.registrySessions}</span>
              </div>
            </SettingsCard>
            <SettingsCard className="flex flex-col gap-[8px] px-[20px] py-[14px]">
              <p className="text-[13px] leading-[18px] font-medium text-foreground">{copy.settings.diagnosticsStderr}</p>
              {data.stderrTail.length === 0 ? (
                <p className="text-[12.5px] leading-[18px] text-muted-foreground">—</p>
              ) : (
                <pre className="max-h-[160px] overflow-auto rounded-lg border border-border bg-muted/30 px-[12px] py-[8px] font-mono text-[11px] leading-[16px] whitespace-pre-wrap break-words text-foreground/85">
                  {data.stderrTail}
                </pre>
              )}
            </SettingsCard>
            <button
              type="button"
              onClick={onRestartHost}
              className="h-9 cursor-pointer self-start rounded-lg border border-destructive/50 px-4 text-[13px] leading-none font-medium text-destructive outline-none select-none hover:bg-destructive hover:text-white focus-visible:ring-3 focus-visible:ring-destructive/30"
            >
              {copy.settings.diagnosticsRestart}
            </button>
          </>
        )}
      </div>
    </section>
  );
}

export { DiagnosticsSection };
