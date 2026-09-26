import * as React from 'react';
import type { ChatMessage } from '@/types/domain';
import { MessageItem } from '@/features/chat/message-item';
import { ThinkingRow } from '@/features/chat/thinking-row';
import { StatusLine } from '@/features/chat/status-line';
import { ToolRow } from '@/features/chat/tool-row';
import { ToolGroup } from '@/features/chat/tool-group';

type StreamItemsProps = { messages: readonly ChatMessage[]; onOpenTool: (message: ChatMessage) => void };

export function StreamItems({ messages, onOpenTool }: StreamItemsProps) {
  const nodes: React.ReactNode[] = [];
  let toolRun: ChatMessage[] = [];
  const flushTools = (): void => {
    const [first] = toolRun;
    if (first === undefined) return;
    nodes.push(
      toolRun.length === 1
        ? <ToolRow key={first.id} message={first} onOpen={onOpenTool} />
        : <ToolGroup key={first.id} messages={toolRun} onOpen={onOpenTool} />,
    );
    toolRun = [];
  };
  messages.forEach((message) => {
    if (message.kind === 'tool') {
      toolRun.push(message);
      return;
    }
    flushTools();
    if (message.kind === 'thinking') nodes.push(<ThinkingRow key={message.id} message={message} />);
    else if (message.kind === 'status') nodes.push(<StatusLine key={message.id} message={message} />);
    else nodes.push(<MessageItem key={message.id} message={message} />);
  });
  flushTools();
  return <>{nodes}</>;
}
