import * as React from 'react';
import { cn } from '@/lib/utils';
import { copy } from '@/strings';
import { EmptyThread } from '@/thread/empty-thread';
import { ScrollToBottomButton } from '@/thread/scroll-to-bottom-button';
import { TextBlock } from '@/thread/text-block';
import { TurnGroup } from '@/thread/turn-group';
import { TurnLoadingRow } from '@/thread/turn-loading-row';
import { useStickToBottom } from '@/thread/use-stick-to-bottom';
import { SystemMessageRow } from '@/thread/system-message-row';
import { CONVERSATION_COLUMN_CLASS } from '@/thread/conversation-column';
import { UserMessageRow } from '@/thread/user-message-row';

import type { ThreadItem, ThreadModel } from '@/thread/thread-model';

type MessageListProps = {
  thread: ThreadModel
  now: number
  /** 会话在途（轮次流式/直执行命令/压缩）：消息流尾部显示执行中指示 */
  loading: boolean
  /** 底部输入浮层的避让高度（浮层高度 + 呼吸）：贴底内容完整可见，上翻内容滑入浮层后面 */
  bottomInset: number
  emptyTitle: string
  emptyHint: string
  onOpenAgents: () => void
  onOpenDiff: () => void
  onEditUserMessage: (text: string) => void
  onForkUserMessage?: (entryId: string, text: string, autoResend: boolean) => void
}

/** 水化消息 id（msg-<entryId>）→ 协议 entryId；live 回显（UUID）不可分叉返回 null。 */
function entryIdOf(messageId: string): string | null {
  return messageId.startsWith('msg-') ? messageId.slice('msg-'.length) : null;
}

function itemTopMargin(index: number, item: ThreadItem): string {
  if (index === 0) return '';
  return item.kind === 'turn' ? 'pt-[48px]' : 'pt-[20px]';
}

/** 消息流：用户气泡右对齐、轮次组左对齐，轮与轮之间落时间戳行；离开底部时右下浮出回到底部浮标。 */
function MessageList({ thread, now, loading, bottomInset, emptyTitle, emptyHint, onOpenAgents, onOpenDiff, onEditUserMessage, onForkUserMessage }: MessageListProps) {
  const { containerRef, onScroll, atBottom, scrollToBottom } = useStickToBottom();

  const jumpButton = atBottom ? null : (
    <div className="animate-in fade-in duration-150">
      <ScrollToBottomButton onClick={scrollToBottom} style={{ bottom: bottomInset + 14 }} />
    </div>
  );

  if (thread.items.length === 0) {
    // 首轮事件到达前的空窗（如直执行命令）：留执行中指示，不闪空态引导
    return (
      <div className="relative min-h-0 flex-1">
        <div className="h-full overflow-y-auto">
          {loading ? (
            <div className={`${CONVERSATION_COLUMN_CLASS} flex flex-col pt-6`} style={{ paddingBottom: bottomInset }}>
              <TurnLoadingRow label={copy.flow.executing} />
            </div>
          ) : (
            <EmptyThread title={emptyTitle} hint={emptyHint} />
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-0 flex-1">
      <div ref={containerRef} onScroll={onScroll} className="h-full overflow-y-auto overflow-x-hidden">
        <div className={`${CONVERSATION_COLUMN_CLASS} flex flex-col pt-6`} style={{ paddingBottom: bottomInset }}>
          {thread.items.map((item, index) => (
            <div key={item.kind === 'message' ? item.message.id : item.turn.id} className={cn(itemTopMargin(index, item))}>
              {item.kind === 'message' ? (
                item.message.role === 'user' ? (
                  <UserMessageRow
                    message={item.message}
                    onEdit={onEditUserMessage}
                    onEditRerun={
                      onForkUserMessage === undefined || entryIdOf(item.message.id) === null
                        ? undefined
                        : (text) => onForkUserMessage(entryIdOf(item.message.id) ?? '', text, false)
                    }
                    onRetry={
                      onForkUserMessage === undefined || entryIdOf(item.message.id) === null
                        ? undefined
                        : (text) => onForkUserMessage(entryIdOf(item.message.id) ?? '', text, true)
                    }
                  />
                ) : item.message.role === 'system' ? (
                  <SystemMessageRow message={item.message} />
                ) : (
                  <TextBlock text={item.message.text} />
                )
              ) : (
                <TurnGroup turn={item.turn} now={now} onOpenAgents={onOpenAgents} onOpenDiff={onOpenDiff} />
              )}
            </div>
          ))}
          {loading ? <TurnLoadingRow label={copy.flow.executing} /> : null}
        </div>
      </div>
      {jumpButton}
    </div>
  );
}

const MessageListMemo = React.memo(
  MessageList,
  (prev, next) => prev.thread === next.thread && prev.now === next.now && prev.loading === next.loading && prev.bottomInset === next.bottomInset && prev.emptyTitle === next.emptyTitle && prev.emptyHint === next.emptyHint,
);
export { MessageListMemo as MessageList };
