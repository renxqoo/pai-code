import * as React from "react";
import type { ChatMessage } from "@/types/domain";
import { UserMessage } from "@/features/chat/user-message";
import { AssistantMessage } from "@/features/chat/assistant-message";
import { CodeBlock } from "@/features/chat/code-block";

type MessageItemProps = { message: ChatMessage };

export function MessageItem({ message }: MessageItemProps) {
  if (message.kind === "user") return <UserMessage message={message} />;
  if (message.kind === "assistant" || message.kind === "system")
    return <AssistantMessage message={message} />;
  if (message.kind === "code")
    return (
      <CodeBlock
        code={message.text}
        language={message.language}
        lineCount={message.lineCount}
        title={message.title}
      />
    );
  return null;
}
