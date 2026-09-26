import * as React from 'react';
import type { ChatMessage } from '@/types/domain';
import { buildTurns } from '@/features/chat/turns';
import { MessageItem } from '@/features/chat/message-item';
import { ProcessFold } from '@/features/chat/process-fold';
import { GenerationIndicator } from '@/features/chat/generation-indicator';
import { TurnFailureNotice } from '@/features/chat/turn-failure-notice';

type TimelineListProps = { messages: readonly ChatMessage[]; generating: boolean; elapsedMs?: number | undefined };

export function TimelineList({ messages, generating, elapsedMs }: TimelineListProps) {
  const turns = React.useMemo(() => buildTurns(messages), [messages]);
  return (
    <>
      {turns.map((turn) => (
        <React.Fragment key={turn.key}>
          {turn.user !== null ? <MessageItem message={turn.user} /> : null}
          {turn.stream.length > 0 ? <ProcessFold elapsedMs={elapsedMs} turn={turn} /> : null}
          {turn.result !== null ? <MessageItem message={turn.result} /> : null}
          {turn.failure !== null ? <TurnFailureNotice message={turn.failure} /> : null}
        </React.Fragment>
      ))}
      {generating ? <GenerationIndicator /> : null}
    </>
  );
}
