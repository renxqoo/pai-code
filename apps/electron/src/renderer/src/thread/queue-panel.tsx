import { CONVERSATION_COLUMN_CLASS } from '@/thread/conversation-column';
import { copy } from '@/strings';
import { QueueRow } from './queue-row';

type QueuePanelProps = {
  steering: readonly string[]
  followUp: readonly string[]
  onClear: () => void
}

/** 排队消息面板（A7 裁剪版）：steering/followUp 分组逐条展示 + 全部清空（协议无单条删除）。 */
function QueuePanel({ steering, followUp, onClear }: QueuePanelProps) {
  const empty = steering.length === 0 && followUp.length === 0;
  return (
    <div className={`${CONVERSATION_COLUMN_CLASS} mb-[8px] rounded-[12px] border border-border bg-background px-[14px] py-[10px] shadow-[0_10px_24px_-14px_rgba(24,24,28,0.3)]`}>
      <div className="flex items-center justify-between pb-[8px]">
        <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-muted-foreground">{copy.flow.queuePanelTitle}</p>
        <button type="button" onClick={onClear} className="text-[11.5px] text-muted-foreground hover:text-foreground">
          {copy.flow.clearQueue}
        </button>
      </div>
      {empty ? <p className="pb-[4px] text-[12px] text-muted-foreground">{copy.flow.queueEmpty}</p> : null}
      {steering.length > 0 ? (
        <section className="pb-[6px]">
          <p className="pb-[4px] text-[11px] text-muted-foreground/80">{copy.flow.queueSteering}</p>
          {steering.map((text, index) => (
            <QueueRow key={`s-${index}`} text={text} />
          ))}
        </section>
      ) : null}
      {followUp.length > 0 ? (
        <section>
          <p className="pb-[4px] text-[11px] text-muted-foreground/80">{copy.flow.queueFollowUp}</p>
          {followUp.map((text, index) => (
            <QueueRow key={`f-${index}`} text={text} />
          ))}
        </section>
      ) : null}
    </div>
  );
}

export { QueuePanel };
