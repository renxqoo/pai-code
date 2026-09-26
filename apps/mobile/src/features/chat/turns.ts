import type { ChatMessage } from '@/types/domain';

const processKinds: readonly ChatMessage['kind'][] = ['thinking', 'tool', 'status'];
const isProcess = (message: ChatMessage): boolean => processKinds.includes(message.kind);

export type TurnView = {
  key: string;
  user: ChatMessage | null;
  stream: readonly ChatMessage[];
  result: ChatMessage | null;
  running: boolean;
  failed: boolean;
};

function finishTurn(key: string, user: ChatMessage | null, entries: readonly ChatMessage[]): TurnView {
  const lastProcess = entries.findLastIndex(isProcess);
  const tail = lastProcess < 0 ? entries : entries.slice(lastProcess + 1);
  const result = tail.findLast((message) => message.kind === 'assistant') ?? null;
  return {
    key,
    user,
    stream: entries.filter((message) => message !== result),
    result,
    running: entries.some((message) => message.status === 'running'),
    failed: entries.some((message) => message.status === 'error'),
  };
}

export function buildTurns(messages: readonly ChatMessage[]): readonly TurnView[] {
  const turns: TurnView[] = [];
  let entries: ChatMessage[] = [];
  let user: ChatMessage | null = null;
  const flush = (key: string): void => {
    if (user === null && entries.length === 0) return;
    turns.push(finishTurn(key, user, entries));
    entries = [];
    user = null;
  };
  messages.forEach((message) => {
    if (message.kind === 'user') {
      flush(`turn-${message.id}`);
      user = message;
      return;
    }
    entries.push(message);
  });
  flush('turn-tail');
  return turns;
}
