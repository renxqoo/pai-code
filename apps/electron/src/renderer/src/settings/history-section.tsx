import { formatRelativeAge } from '@/lib/relative-age';
import { copy } from '@/strings';

type HistorySectionProps = {
  saved: ReadonlyArray<{ sessionPath: string; title: string; cwd: string; modifiedAt: number; messageCount: number }>
  onOpenSaved: (sessionPath: string) => void
  onRefreshSaved: () => void
}

/** History 分区：已保存会话卡列表（点击 resume），最多展示 40 条，支持手动刷新。 */
function HistorySection({ saved, onOpenSaved, onRefreshSaved }: HistorySectionProps) {
  const now = Date.now();
  return (
    <section>
      <div className="flex items-center justify-between pb-[10px]">
        <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-muted-foreground">{copy.settings.historyTitle}</p>
        <button type="button" onClick={onRefreshSaved} className="text-[11.5px] text-muted-foreground hover:text-foreground">
          {copy.settings.refresh}
        </button>
      </div>
      {saved.length === 0 ? <p className="text-[12.5px] text-muted-foreground">{copy.settings.historyEmpty}</p> : null}
      <div className="flex flex-col gap-[6px]">
        {saved.slice(0, 40).map((session) => (
          <button
            key={session.sessionPath}
            type="button"
            onClick={() => onOpenSaved(session.sessionPath)}
            className="flex flex-col items-start gap-[3px] rounded-[10px] border border-border px-[12px] py-[9px] text-left hover:bg-muted/50"
          >
            <span className="w-full truncate text-[12.5px] text-foreground">{session.title}</span>
            <span className="text-[11px] text-muted-foreground">
              {formatRelativeAge(now, session.modifiedAt)} · {session.messageCount} msgs · {session.cwd}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

export { HistorySection };
