import * as React from 'react';
import type { ChatMessage } from '@/types/domain';
import { UserMessage } from '@/features/chat/user-message';
import { AssistantMessage } from '@/features/chat/assistant-message';
import { CodeBlock } from '@/features/chat/code-block';
import { StatusRow } from '@/features/chat/status-row';
import { ThinkingBlock } from '@/features/chat/thinking-block';
import { ToolBlock } from '@/features/chat/tool-block';

type MessageItemProps = { message: ChatMessage };

export function MessageItem({ message }: MessageItemProps) {
  if (message.kind === 'user') return <UserMessage message={message} />;
  if (message.kind === 'assistant' || message.kind === 'system') return <AssistantMessage message={message} />;
  if (message.kind === 'code') return <CodeBlock message={message} />;
  if (message.kind === 'status') return <StatusRow message={message} />;
  if (message.kind === 'thinking') return <ThinkingBlock block={{ kind: 'thinking', key: message.id, messages: [message] }} />;
  if (message.kind === 'tool') return <ToolBlock block={{ kind: 'tools', key: `tools-${message.id}`, messages: [message] }} />;
  return null;
}
