import { copy } from '@/strings';

/** 诊断数据视图（app/diagnostics 结果）。 */
type DiagnosticsView = {
  hostPhase: 'starting' | 'ready' | 'restarting' | 'failed' | null
  stderrTail: string
  registrySessions: number
}

type DiagnosticsSectionProps = {
  /** null = 尚未加载（显示空态）。 */
  data: DiagnosticsView | null
  onRefresh: () => void
  onRestart: () => void
}

/** host 相位色点：ready 绿 / failed 红 / 其余（含未加载）muted。 */
function phaseDotClass(hostPhase: DiagnosticsView['hostPhase']): string {
  if (hostPhase === 'ready') return 'bg-dot-done';
  if (hostPhase === 'failed') return 'bg-stop';
  return 'bg-muted-foreground/35';
}

/** Diagnostics 分区：host 相位 / 注册表会话数 / stderr 尾部，附刷新与重启动作。 */
function DiagnosticsSection({ data, onRefresh, onRestart }: DiagnosticsSectionProps) {
  return (
    <section>
      <div className="flex items-center justify-between pb-[10px]">
        <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-muted-foreground">{copy.settings.diagnosticsTitle}</p>
        <button
          type="button"
          onClick={onRefresh}
          className="cursor-pointer text-[11.5px] text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          {copy.settings.refresh}
        </button>
      </div>
      {data === null ? (
        <p className="pb-[10px] text-[12.5px] text-muted-foreground">{copy.settings.diagnosticsEmpty}</p>
      ) : (
        <div className="flex flex-col gap-[12px]">
          <div className="divide-y divide-border rounded-[10px] border border-border">
            <div className="flex items-center justify-between gap-[12px] px-[12px] py-[9px]">
              <span className="text-[12px] text-muted-foreground">{copy.settings.diagnosticsPhase}</span>
              <span className="flex shrink-0 items-center gap-[6px]">
                <span aria-hidden="true" className={`size-[7px] shrink-0 rounded-full ${phaseDotClass(data.hostPhase)}`} />
                <span className="font-mono text-[11.5px] text-foreground">{data.hostPhase ?? '—'}</span>
              </span>
            </div>
            <div className="flex items-center justify-between gap-[12px] px-[12px] py-[9px]">
              <span className="text-[12px] text-muted-foreground">{copy.settings.diagnosticsRegistry}</span>
              <span className="shrink-0 font-mono text-[11.5px] tabular-nums text-foreground">{data.registrySessions}</span>
            </div>
          </div>
          <div className="flex flex-col gap-[6px]">
            <p className="text-[11.5px] font-medium text-muted-foreground">{copy.settings.diagnosticsStderr}</p>
            {data.stderrTail.length === 0 ? (
              <p className="text-[12.5px] text-muted-foreground">—</p>
            ) : (
              <pre className="max-h-[160px] overflow-auto rounded-[10px] border border-border bg-muted/30 px-[12px] py-[8px] font-mono text-[11px] leading-[16px] whitespace-pre-wrap break-words text-foreground/85">
                {data.stderrTail}
              </pre>
            )}
          </div>
          <button
            type="button"
            onClick={onRestart}
            className="h-[30px] cursor-pointer self-start rounded-[8px] border border-red-600/50 px-[14px] text-[12px] font-medium text-red-600 outline-none hover:bg-red-600 hover:text-white focus-visible:ring-3 focus-visible:ring-red-600/30"
          >
            {copy.settings.diagnosticsRestart}
          </button>
        </div>
      )}
    </section>
  );
}

export { DiagnosticsSection };
