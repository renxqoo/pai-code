import * as React from 'react';
import { GitBranch, PenLine, RotateCcw } from 'lucide-react';

import { ChatBubble, CopyButton, IconButton } from '@paiapp/ui';

import { copy } from '@/strings';
import { writeClipboardText } from '@/lib/clipboard';
import { parseSkillInvocation, toSkillInvocationInput } from './skill-invocation';
import { SkillInvocationMessage } from './skill-invocation-message';
import type { SessionMessage } from './thread-model';

type UserMessageRowProps = {
  message: SessionMessage
  /** 编辑重发：把原文回填草稿并聚焦输入框 */
  onEdit: (text: string) => void
  /** 编辑并重开：fork 到该消息之前并回填（用户改完手动发，落在分叉线程） */
  onEditRerun?: (text: string) => void
  /** 从这里重试：fork 到该消息之前并自动原样重发 */
  onRetry?: (text: string) => void
}

/** 用户消息行：右对齐气泡 + hover 浮出的复制/编辑操作。
 * 技能调用（hub 预改写为指针行 [name](url:path)）单框转义：内联高亮技能名 + 附加指令同一气泡，
 * 路径不进展示层；编辑/重试回填紧凑输入形式（重发等价），复制仍取全量真相文本。 */
function UserMessageRow({ message, onEdit, onEditRerun, onRetry }: UserMessageRowProps) {
  const invocation = parseSkillInvocation(message.text);
  const editSource = invocation === null ? message.text : toSkillInvocationInput(invocation);
  return (
    <div className="group flex flex-col items-end">
      {message.images.length > 0 ? (
        <div className="flex max-w-full flex-wrap justify-end gap-[6px] pb-[6px]">
          {message.images.map((image, index) => (
            <img
              key={`${message.id}:${index}`}
              src={`data:${image.mimeType};base64,${image.data}`}
              alt=""
              className="size-[120px] rounded-[10px] border border-border object-cover"
            />
          ))}
        </div>
      ) : null}
      {invocation !== null ? (
        <SkillInvocationMessage invocation={invocation} />
      ) : message.text.length > 0 ? (
        <ChatBubble>{message.text}</ChatBubble>
      ) : null}
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
          onClick={() => onEdit(editSource)}
          className="text-muted-foreground/85"
        >
          <PenLine className="size-3.5" strokeWidth={1.75} />
        </IconButton>
        {onEditRerun !== undefined ? (
          <IconButton
            label={copy.flow.editRerun}
            size="xs"
            onClick={() => onEditRerun(editSource)}
            className="text-muted-foreground/85"
          >
            <GitBranch className="size-3.5" strokeWidth={1.75} />
          </IconButton>
        ) : null}
        {onRetry !== undefined ? (
          <IconButton
            label={copy.flow.retryFromHere}
            size="xs"
            onClick={() => onRetry(editSource)}
            className="text-muted-foreground/85"
          >
            <RotateCcw className="size-3.5" strokeWidth={1.75} />
          </IconButton>
        ) : null}
      </div>
    </div>
  );
}

const UserMessageRowMemo = React.memo(UserMessageRow);
export { UserMessageRowMemo as UserMessageRow };
