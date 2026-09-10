import type { RuntimeEventView } from '@paiapp/contracts';

import { copy } from '@/strings';
import { cn } from '@/lib/utils';
import { formatClockTime } from '@/thread/format-clock-time';
import { RuntimeCard } from '@/screens/runtime-card';

type RuntimeDiagnosticsProps = {
  events: ReadonlyArray<RuntimeEventView>
  diagnosticLog: string | null
  onLoadDiagnosticLog: () => void
  onCopySummary: () => void
  onExportDiagnostics: () => void
  onRestartHost: () => void
}

const levelDotClass = {
  info: 'bg-muted-foreground/40',
  warn: 'bg-spark',
  error: 'bg-destructive',
} as const;

const actionButtonClass =
  'flex h-[28px] cursor-pointer items-center rounded-[8px] border border-border px-[12px] text-[12px] leading-none text-foreground outline-none select-none hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-40';

/** 诊断区：事件时间线 + 宿主 stderr 尾部（按需加载）+ 摘要/导出/重启操作行。 */
function RuntimeDiagnostics({ events, diagnosticLog, onLoadDiagnosticLog, onCopySummary, onExportDiagnostics, onRestartHost }: RuntimeDiagnosticsProps) {
  return (
    <RuntimeCard title={copy.runtime.timeline}>
      <div className="grid grid-cols-[minmax(0,1fr)_320px] gap-[14px] pt-[2px]">
        <div className="scroll-thin max-h-[260px] min-w-0 overflow-y-auto pr-[2px]">
          {events.length === 0 ? (
            <p className="py-[20px] text-[12px] text-muted-foreground">{copy.runtime.timelineEmpty}</p>
          ) : (
            <ol className="flex flex-col">
              {events.map((event, index) => (
                <li key={`${event.at}-${index}`} className="flex items-start gap-[8px] py-[4px]">
                  <span aria-hidden="true" className={cn('mt-[5px] size-[6px] shrink-0 rounded-full', levelDotClass[event.level])} />
                  <span className="shrink-0 pt-[1px] font-mono text-[10.5px] leading-[15px] tabular-nums text-meta-faint">
                    {formatClockTime(event.at)}
                  </span>
                  <span className="shrink-0 rounded-[4px] bg-muted px-[5px] pt-[3px] pb-[2px] font-mono text-[10px] leading-none text-muted-foreground">
                    {event.kind}
                  </span>
                  <span className="min-w-0 flex-1 text-[11.5px] leading-[15px] break-words text-foreground/85">{event.detail}</span>
                </li>
              ))}
            </ol>
          )}
        </div>
        <div className="flex min-w-0 flex-col gap-[6px]">
          <span className="truncate text-[11px] leading-none text-muted-foreground">{copy.runtime.stderr}</span>
          {diagnosticLog === null ? (
            <button
              type="button"
              onClick={onLoadDiagnosticLog}
              className="flex h-[196px] cursor-pointer items-center justify-center rounded-[8px] border border-dashed border-border text-[11px] text-muted-foreground/70 outline-none select-none hover:border-muted-foreground/40 hover:text-muted-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              {copy.runtime.stderrLoad}
            </button>
          ) : (
            <pre className="scroll-thin h-[196px] overflow-auto rounded-[8px] bg-surface-subtle p-[10px] font-mono text-[10.5px] leading-[15px] break-words whitespace-pre-wrap text-muted-foreground">
              {diagnosticLog.length === 0 ? copy.runtime.stderrEmpty : diagnosticLog}
            </pre>
          )}
        </div>
      </div>
      <div className="flex items-center gap-[8px] border-t border-border/60 pt-[10px] mt-[10px]">
        <button type="button" onClick={onCopySummary} className={actionButtonClass}>
          {copy.runtime.copySummary}
        </button>
        <button type="button" onClick={onExportDiagnostics} className={actionButtonClass}>
          {copy.runtime.exportBundle}
        </button>
        <button
          type="button"
          onClick={onRestartHost}
          className="ml-auto flex h-[28px] cursor-pointer items-center rounded-[8px] bg-destructive px-[12px] text-[12px] leading-none font-medium text-white outline-none select-none hover:bg-destructive/90 focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {copy.runtime.restartHost}
        </button>
      </div>
    </RuntimeCard>
  );
}

export { RuntimeDiagnostics };
export type { RuntimeDiagnosticsProps };
