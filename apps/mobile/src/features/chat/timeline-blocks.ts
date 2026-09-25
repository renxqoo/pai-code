import type { ChatMessage } from "@/types/domain";

export type TimelineBlock =
  | { kind: "message"; key: string; message: ChatMessage }
  | { kind: "activity"; key: string; messages: readonly ChatMessage[] };

type MutableTimelineBlock =
  | { kind: "message"; key: string; message: ChatMessage }
  | { kind: "activity"; key: string; messages: ChatMessage[] };

function isActivityMessage(message: ChatMessage): boolean {
  return message.kind === "thinking" || message.kind === "tool" || message.kind === "status";
}

export function groupTimeline(messages: readonly ChatMessage[]): readonly TimelineBlock[] {
  const blocks: MutableTimelineBlock[] = [];
  messages.forEach((message) => {
    if (!isActivityMessage(message)) {
      blocks.push({ kind: "message", key: message.id, message });
      return;
    }
    const last = blocks.at(-1);
    if (last?.kind === "activity") {
      last.messages.push(message);
      return;
    }
    blocks.push({ kind: "activity", key: `activity-${message.id}`, messages: [message] });
  });
  return blocks;
}
