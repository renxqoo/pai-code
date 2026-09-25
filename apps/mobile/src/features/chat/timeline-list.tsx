import * as React from "react";
import type { ChatMessage } from "@/types/domain";
import { groupTimeline } from "@/features/chat/timeline-blocks";
import { MessageItem } from "@/features/chat/message-item";
import { ActivityBlock } from "@/features/chat/activity-block";
import { GenerationIndicator } from "@/features/chat/generation-indicator";

type TimelineListProps = { messages: readonly ChatMessage[]; generating: boolean };

export function TimelineList({ messages, generating }: TimelineListProps) {
  const blocks = React.useMemo(() => groupTimeline(messages), [messages]);
  return (
    <>
      {blocks.map((block) => {
        if (block.kind === "activity") return <ActivityBlock block={block} key={block.key} />;
        return <MessageItem key={block.key} message={block.message} />;
      })}
      {generating ? <GenerationIndicator /> : null}
    </>
  );
}
