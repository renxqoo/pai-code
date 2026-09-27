import * as React from 'react';
import { cn } from '@/lib/utils';
import { copy } from '@/strings';
import { EmptyThread } from '@/thread/empty-thread';
import { TextBlock } from '@/thread/text-block';
import { TurnGroup } from '@/thread/turn-group';
import { TurnLoadingRow } from '@/thread/turn-loading-row';
import { SystemMessageRow } from '@/thread/system-message-row';
import { CONVERSATION_COLUMN_CLASS } from '@/thread/conversation-column';
import { UserMessageRow } from '@/thread/user-message-row';

import type { ThreadItem, ThreadModel } from '@/thread/thread-model';

type MessageListProps = {
  thread: ThreadModel
  now: number
  /** 会话在途（轮次流式/直执行命令/压缩）：消息流尾部显示执行中指示 */
  loading: boolean
  /** 底部输入浮层的避让高度：浮层高度 + 呼吸）：贴底内容完整可见，上翻内容滑入浮层后面 */
  bottomInset: number
  emptyTitle: string
  emptyHint: string
  /** 历史水化失败态的重试动作（不提供则空态无重试按钮）；提供时文案必传。 */
  onRetryHydrate?: () => void
  retryLabel: string
  onOpenDiff: () => void
  onEditUserMessage: (text: string) => void
  onForkUserMessage?: (entryId: string, text: string, images: ReadonlyArray<{ data: string; mimeType: string }>, autoResend: boolean) => void
}

/** 水化消息 id（msg-<entryId>）→ 协议 entryId；live 回显（UUID）不可分叉返回 null。 */
function entryIdOf(messageId: string): string | null {
  return messageId.startsWith('msg-') ? messageId.slice('msg-'.length) : null;
}

function itemTopMargin(index: number, item: ThreadItem): string {
  if (index === 0) return '';
  return item.kind === 'turn' ? 'pt-[48px]' : 'pt-[20px]';
}

/** 消息内容列：用户气泡右对齐、轮次组左对齐，轮与轮之间落时间戳行；滚动与贴底跟随由页面滚动容器负责。
 * shrink-0 + min-h-full：列盒取自然高度（空态撑满视口居中），底部 padding（输入浮层避让）计入可滚动区域。 */
function MessageList({ thread, now, loading, bottomInset, emptyTitle, emptyHint, onRetryHydrate, retryLabel, onOpenDiff, onEditUserMessage, onForkUserMessage }: MessageListProps) {
  const empty = thread.items.length === 0;
  return (
    <div className={`${CONVERSATION_COLUMN_CLASS} flex min-h-full shrink-0 flex-col pt-6 px-3`} style={{ paddingBottom: bottomInset }}>
      {empty ? (
        // 首轮事件到达前的空窗（如直执行命令）：留执行中指示，不闪空态引导
        loading ? <TurnLoadingRow label={copy.flow.executing} /> : <EmptyThread title={emptyTitle} hint={emptyHint} onRetry={onRetryHydrate} retryLabel={retryLabel} />
      ) : (
        <>
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
                        : (text, images) => onForkUserMessage(entryIdOf(item.message.id) ?? '', text, images, false)
                    }
                    onRetry={
                      onForkUserMessage === undefined || entryIdOf(item.message.id) === null
                        ? undefined
                        : (text, images) => onForkUserMessage(entryIdOf(item.message.id) ?? '', text, images, true)
                    }
                  />
                ) : item.message.role === 'system' ? (
                  <SystemMessageRow message={item.message} />
                ) : (
                  <TextBlock text={item.message.text} />
                )
              ) : (
                <TurnGroup turn={item.turn} now={now} onOpenDiff={onOpenDiff} />
              )}
            </div>
          ))}
          {loading ? <TurnLoadingRow label={copy.flow.executing} /> : null}
        </>
      )}
    </div>
  );
}

const MessageListMemo = React.memo(
  MessageList,
  (prev, next) => prev.thread === next.thread && prev.now === next.now && prev.loading === next.loading && prev.bottomInset === next.bottomInset && prev.emptyTitle === next.emptyTitle && prev.emptyHint === next.emptyHint && prev.onRetryHydrate === next.onRetryHydrate && prev.retryLabel === next.retryLabel && prev.onOpenDiff === next.onOpenDiff && prev.onEditUserMessage === next.onEditUserMessage && prev.onForkUserMessage === next.onForkUserMessage,
);
export { MessageListMemo as MessageList };
