import type { ChatMessage } from '@/types/domain';

export type TimelineBlock =
  | { kind: 'message'; key: string; message: ChatMessage }
  | { kind: 'thinking'; key: string; messages: readonly ChatMessage[] }
  | { kind: 'tools'; key: string; messages: readonly ChatMessage[] };

export function groupTimeline(messages: readonly ChatMessage[]): readonly TimelineBlock[] {
  const blocks: TimelineBlock[] = [];
  messages.forEach((message) => {
    const last = blocks.at(-1);
    if (message.kind === 'thinking' && last?.kind === 'thinking') {
      blocks[blocks.length - 1] = { ...last, messages: [...last.messages, message] };
      return;
    }
    if (message.kind === 'tool' && last?.kind === 'tools') {
      blocks[blocks.length - 1] = { ...last, messages: [...last.messages, message] };
      return;
    }
    const kind = message.kind === 'thinking' ? 'thinking' : message.kind === 'tool' ? 'tools' : 'message';
    blocks.push(kind === 'message' ? { kind, key: message.id, message } : { kind, key: `${kind}-${message.id}`, messages: [message] });
  });
  return blocks;
}
