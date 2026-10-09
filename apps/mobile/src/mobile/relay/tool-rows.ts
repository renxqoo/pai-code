import type { ChatMessage } from '@/types/domain';

/**
 * 工具行 id 域：`tool-<callId>`——WAL 投影与运行期事件共用一套 id，
 * 水化出来的历史行才能被后续 toolEnded 收敛。
 */
export function toolRowId(callId: string): string {
  return `tool-${callId}`;
}

/**
 * 同一次工具调用的 call/result 两行折成一行（症状：打开有工具历史的会话，
 * 每次工具调用渲染两张卡——参数卡永远停在运行态，结果卡另起一行）。
 *
 * WAL 顺序恒为 call 在前 result 在后；跨窗口（call 落在上一页、result 落在本页）
 * 与乱序到达都收敛到终态：结果行自带终态，孤立的 call 行由同批结果回填，
 * 批内无结果的 call 行保留运行态交由运行期事件或 turnSettled 收敛。
 */
export function foldToolRows(items: readonly ChatMessage[]): ChatMessage[] {
  const index = new Map<string, number>();
  const folded: ChatMessage[] = [];
  for (const message of items) {
    if (message.kind !== 'tool') {
      folded.push(message);
      continue;
    }
    const at = index.get(message.id);
    if (at === undefined) {
      index.set(message.id, folded.length);
      folded.push(message);
      continue;
    }
    folded[at] = mergeToolRow(folded[at] as ChatMessage, message);
  }
  return folded;
}

function mergeToolRow(previous: ChatMessage, next: ChatMessage): ChatMessage {
  const isTerminal = next.status === 'ok' || next.status === 'failed' || next.status === 'stopped';
  const toolName = next.toolName !== undefined && next.toolName.length > 0 ? next.toolName : previous.toolName;
  const argsPreview = next.argsPreview !== undefined && next.argsPreview.length > 0 ? next.argsPreview : previous.argsPreview;
  return {
    ...previous,
    ...(isTerminal && next.status !== undefined ? { status: next.status } : {}),
    text: next.text.length > 0 ? next.text : previous.text,
    ...(toolName !== undefined ? { toolName } : {}),
    ...(argsPreview !== undefined ? { argsPreview } : {}),
    ...(next.durationMs !== undefined ? { durationMs: next.durationMs } : {}),
    ...(Array.isArray(next.editHunks) ? { editHunks: next.editHunks } : {}),
    ...(Array.isArray(next.subagents) ? { subagents: next.subagents } : {}),
  };
}