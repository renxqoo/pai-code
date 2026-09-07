import { PenLine } from 'lucide-react';

import { ChatBubble, CopyButton, IconButton } from '@paiapp/ui';

import { copy } from '@/strings';
import { writeClipboardText } from '@/lib/clipboard';
import type { SessionMessage } from './thread-model';

type UserMessageRowProps = {
  message: SessionMessage
  /** 编辑重发：把原文回填草稿并聚焦输入框（截断重发语义在接入 Client 后扩展） */
  onEdit: (text: string) => void
}

/** 用户消息行：右对齐气泡 + hover 浮出的复制/编辑操作。 */
function UserMessageRow({ message, onEdit }: UserMessageRowProps) {
  return (
    <div className="group flex flex-col items-end">
      <ChatBubble>{message.text}</ChatBubble>
      <div className="flex items-center gap-[6px] pt-[4px] opacity-0 transition-opacity duration-150 group-hover:opacity-100 focus-within:opacity-100 motion-reduce:transition-none">
        <CopyButton
          label={copy.flow.copyMessage}
          copiedLabel={copy.flow.copied}
          value={message.text}
          onCopy={writeClipboardText}
        />
        <IconButton
          label={copy.flow.editMessage}
          size="xs"
          onClick={() => onEdit(message.text)}
          className="text-muted-foreground/85"
        >
          <PenLine className="size-3.5" strokeWidth={1.75} />
        </IconButton>
      </div>
    </div>
  );
}

export { UserMessageRow };
