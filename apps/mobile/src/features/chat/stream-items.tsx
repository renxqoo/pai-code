import * as React from 'react';
import type { FileDiffGroup } from '@x3code/ui-thread';

import type { ChatMessage } from '@/types/domain';
import { MessageItem } from '@/features/chat/message-item';
import { ThinkingRow } from '@/features/chat/thinking-row';
import { StatusLine } from '@/features/chat/status-line';
import { ToolBatch } from '@/features/chat/tool-batch';

type StreamItemsProps = {
  messages: readonly ChatMessage[];
  onOpenTool: (message: ChatMessage) => void;
  onOpenDiff: (group: FileDiffGroup) => void;
};

/**
 * 过程流条目装配：连续的工具调用合成一个执行批次（≥2 条套并行组头），
 * 思考/状态各自一行，其余按消息形态渲染。
 */
export function StreamItems({ messages, onOpenTool, onOpenDiff }: StreamItemsProps) {
  const nodes: React.ReactNode[] = [];
  let toolRun: ChatMessage[] = [];
  const flushTools = (): void => {
    const [first] = toolRun;
    if (first === undefined) return;
    nodes.push(
      <ToolBatch key={first.id} messages={toolRun} onOpen={onOpenTool} onOpenDiff={onOpenDiff} />,
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
