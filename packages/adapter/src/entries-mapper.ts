import type { HistoryItem } from '@paiapp/contracts';

import { assistantText, assistantThinking, assistantToolCalls, flattenUserText, toolResultText, userImages } from './content';
import { previewArgs } from './args-preview';
import { diffFromEditArgs, diffFromWriteArgs } from './diff-extract';
import { subagentsField } from './subagent-spawns';

/**
 * get_entries 条目（WAL 事件行 {seq, ts, event}）→ HistoryItem[]（对话流的唯一真相源）。
 * id = `seq-<seq>`（持久稳定，增量对账按 id 去重）；messageTs = 行 ts。
 * 分组语义：tool_result 事件并入其 toolUseId 所属的前一条 assistant 条目；
 * 直执行 bash 以 user 消息信封（`[bash] $ <cmd>\n<output>`）落 WAL，按前缀还原；
 * 元数据事件（session_init、turn_*、step_*、inbox_spliced、llm_retry、compaction、
 * session_meta、permission_decision、request_header、custom、tool_result_redacted）
 * 不产生渲染条目（cursor 仍推进——按行消费，不按渲染条目消费）。
 */

const BASH_ENVELOPE = '[bash] $ ';

/** assistant 条目的工具调用元素（tool_result 并入的目标形状）。 */
type AssistantToolCall = Extract<HistoryItem, { kind: 'assistant' }>['toolCalls'][number];

export function mapEntries(data: unknown): { items: HistoryItem[]; cursor: number | null } {
  const list = Array.isArray((recordOf(data))['entries']) ? (recordOf(data)['entries'] as unknown[]) : [];
  const items: HistoryItem[] = [];
  // toolUseId → 最近一个 assistant HistoryItem 的 toolCalls 数组引用（后续 tool_result 并入）
  const pendingTools = new Map<string, AssistantToolCall[]>();
  let cursor: number | null = null;

  for (const raw of list) {
    const entry = recordOf(raw);
    const seq = entry['seq'];
    if (typeof seq !== 'number' || !Number.isFinite(seq)) continue;
    cursor = seq;
    const event = recordOf(entry['event']);
    const at = typeof entry['ts'] === 'number' ? entry['ts'] : 0;
    const id = `seq-${seq}`;
    const type = event['type'];

    if (type === 'message') {
      const role = event['role'];
      if (role === 'user') {
        const text = flattenUserText(event['content']);
        const bashItem = bashItemOf(id, at, text);
        if (bashItem !== null) {
          items.push(bashItem);
        } else {
          const origin = event['origin'] === 'notification' || event['origin'] === 'system' ? 'system' : 'user';
          items.push({ kind: 'user', id, text, origin, at, images: userImages(event['content']) });
        }
        pendingTools.clear();
        continue;
      }
      if (role === 'assistant') {
        const toolCallViews = assistantToolCalls(event['content']).map((call) => ({
          id: call.id,
          name: call.name,
          argsPreview: previewArgs(call.args),
          output: '',
          isError: false,
          diff: call.name === 'write_file' ? writeDiffOf(call.args) : call.name === 'edit_file' ? editDiffOf(call.args) : null,
          ...subagentsField(call.name, call.args),
        }));
        // 异常终态收窄：error/aborted/length 透传，正常 stop/tool_use 不产生视图噪音
        const rawStopReason = event['stopReason'];
        const stopReason = rawStopReason === 'error' || rawStopReason === 'aborted' || rawStopReason === 'length' ? rawStopReason : null;
        const errorMessage = str(recordOf(event['meta'])['error']);
        items.push({
          kind: 'assistant',
          id,
          at,
          messageTs: at,
          text: assistantText(event['content']),
          thinking: assistantThinking(event['content']),
          toolCalls: toolCallViews,
          usage: usageOf(event['usage']),
          stopReason,
          errorMessage: stopReason === 'error' && errorMessage.length > 0 ? errorMessage : null,
        });
        for (const call of toolCallViews) pendingTools.set(call.id, toolCallViews);
        continue;
      }
      continue;
    }

    if (type === 'tool_result') {
      // 并入所属 assistant 条目的同名工具调用（按 id 原位更新）；找不到（异常序）则丢弃
      const callId = str(event['toolUseId']);
      const target = pendingTools.get(callId);
      if (target === undefined) continue;
      const name = str(event['toolName']);
      for (let index = 0; index < target.length; index += 1) {
        const call = target[index];
        if (call === undefined || call.id !== callId) continue;
        target[index] = {
          id: callId,
          name: call.name.length > 0 ? call.name : name,
          argsPreview: call.argsPreview,
          output: toolResultText(event['content']),
          isError: event['isError'] === true,
          // write/edit 的 diff 来自参数（执行前已知），tool_result 无 diff 不得清掉
          diff: call.diff,
          subagents: call.subagents,
        };
        break;
      }
      continue;
    }

    // 其余事件类型：元数据/账本域，不产生渲染条目（cursor 已推进）
  }

  return { items, cursor };
}

/** 直执行 bash 信封还原：首行 `[bash] $ <cmd>`、其余为输出。 */
function bashItemOf(id: string, at: number, text: string): HistoryItem | null {
  if (!text.startsWith(BASH_ENVELOPE)) return null;
  const rest = text.slice(BASH_ENVELOPE.length);
  const newline = rest.indexOf('\n');
  const command = newline === -1 ? rest : rest.slice(0, newline);
  const output = newline === -1 ? '' : rest.slice(newline + 1);
  return { kind: 'bash', id, command, output, exitCode: 0, cancelled: false, at };
}

function editDiffOf(args: Record<string, unknown>): { path: string; additions: number; deletions: number }[] | null {
  const view = diffFromEditArgs(args);
  return view === null ? null : [view];
}

function writeDiffOf(args: Record<string, unknown>): { path: string; additions: number; deletions: number }[] | null {
  const view = diffFromWriteArgs(args);
  return view === null ? null : [view];
}

/** 内核 usage {inputTokens, outputTokens} → 视图 {input, output}。 */
function usageOf(usage: unknown): { input: number; output: number } | null {
  const u = recordOf(usage);
  const input = u['inputTokens'];
  const output = u['outputTokens'];
  if (typeof input !== 'number' || typeof output !== 'number') return null;
  return { input, output };
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function recordOf(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}
