import { changedFileCount } from '@paiapp/ui-thread';

import type { ChatMessage } from '@/types/domain';
import { toolViewOf } from '@/features/chat/tool-message';

const processKinds: readonly ChatMessage['kind'][] = ['thinking', 'tool', 'status'];
const isProcess = (message: ChatMessage): boolean => processKinds.includes(message.kind);

export type TurnView = {
  key: string;
  user: ChatMessage | null;
  stream: readonly ChatMessage[];
  result: ChatMessage | null;
  /** 轮级失败终态通知：agent 停止于错误，按最终消息形态置于轮末（非折叠头状态）。 */
  failure: ChatMessage | null;
  running: boolean;
  failed: boolean;
  /** 轮级变更摘要：成功改动的文件数（null = 无变更，头行不挂后缀）。 */
  changedFiles: number | null;
};

function terminalFailure(entries: readonly ChatMessage[]): ChatMessage | null {
  const lastStatus = entries.findLastIndex((message) => message.status !== undefined);
  if (lastStatus < 0) return null;
  const terminal = entries[lastStatus];
  if (terminal?.status !== 'failed') return null;
  // 错误是最后发言才算终态；其后出现 assistant 结果说明已恢复（错误留在过程流）。
  const after = entries.slice(lastStatus + 1);
  return after.some((message) => message.kind === 'assistant') ? null : terminal;
}

function finishTurn(key: string, user: ChatMessage | null, entries: readonly ChatMessage[]): TurnView {
  const lastProcess = entries.findLastIndex(isProcess);
  const tail = lastProcess < 0 ? entries : entries.slice(lastProcess + 1);
  const result = tail.findLast((message) => message.kind === 'assistant') ?? null;
  const failure = terminalFailure(entries);
  return {
    key,
    user,
    stream: entries.filter((message) => message !== result && message !== failure),
    result,
    failure,
    running: entries.some((message) => message.status === 'running'),
    failed: failure !== null,
    changedFiles: changedFileCount(entries.filter((message) => message.kind === 'tool').map(toolViewOf)),
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
