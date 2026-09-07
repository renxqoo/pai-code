import { cn } from '@/lib/utils';
import { EmptyThread } from '@/thread/empty-thread';
import { ScrollToBottomButton } from '@/thread/scroll-to-bottom-button';
import { TextBlock } from '@/thread/text-block';
import { TurnGroup } from '@/thread/turn-group';
import { useStickToBottom } from '@/thread/use-stick-to-bottom';
import { SystemMessageRow } from '@/thread/system-message-row';
import { UserMessageRow } from '@/thread/user-message-row';

import type { ThreadItem, ThreadModel } from '@/thread/thread-model';

type MessageListProps = {
  thread: ThreadModel
  now: number
  emptyTitle: string
  emptyHint: string
  onOpenAgents: () => void
  onOpenDiff: () => void
  onEditUserMessage: (text: string) => void
}

function itemTopMargin(index: number, item: ThreadItem): string {
  if (index === 0) return '';
  return item.kind === 'turn' ? 'pt-[48px]' : 'pt-[20px]';
}

/** 消息流：用户气泡右对齐、轮次组左对齐，轮与轮之间落时间戳行；离开底部时右下浮出回到底部浮标。 */
function MessageList({ thread, now, emptyTitle, emptyHint, onOpenAgents, onOpenDiff, onEditUserMessage }: MessageListProps) {
  const { containerRef, onScroll, atBottom, scrollToBottom } = useStickToBottom();

  const jumpButton = atBottom ? null : (
    <div className="animate-in fade-in duration-150">
      <ScrollToBottomButton onClick={scrollToBottom} />
    </div>
  );

  if (thread.items.length === 0) {
    return (
      <div className="relative min-h-0 flex-1">
        <div className="h-full overflow-y-auto">
          <EmptyThread title={emptyTitle} hint={emptyHint} />
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-0 flex-1">
      <div ref={containerRef} onScroll={onScroll} className="h-full overflow-y-auto">
        <div className="mx-auto flex w-full max-w-[700px] flex-col pt-6 pb-10">
          {thread.items.map((item, index) => (
            <div key={item.kind === 'message' ? item.message.id : item.turn.id} className={cn(itemTopMargin(index, item))}>
              {item.kind === 'message' ? (
                item.message.role === 'user' ? (
                  <UserMessageRow message={item.message} onEdit={onEditUserMessage} />
                ) : item.message.role === 'system' ? (
                  <SystemMessageRow message={item.message} />
                ) : (
                  <TextBlock id={item.message.id} text={item.message.text} />
                )
              ) : (
                <TurnGroup turn={item.turn} now={now} onOpenAgents={onOpenAgents} onOpenDiff={onOpenDiff} />
              )}
            </div>
          ))}
        </div>
      </div>
      {jumpButton}
    </div>
  );
}

export { MessageList };
