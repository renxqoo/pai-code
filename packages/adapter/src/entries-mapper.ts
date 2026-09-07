import type { HistoryItem } from '@paiapp/contracts';

import { assistantText, assistantThinking, assistantToolCalls, flattenUserText, toolResultText } from './content';
import { previewArgs } from './args-preview';
import { diffFromPatch, diffFromWriteArgs } from './diff-extract';

/**
 * get_entries 条目 → HistoryItem[]（对话流的唯一真相源）。
 * id = 条目 id（持久稳定，增量对账按 id 去重）。
 * 分组语义：toolResult 条目并入其 toolCallId 所属的前一条 assistant 条目；
 * 元数据条目（thinking_level_change/model_change/compaction/…）不产生渲染条目。
 * task-notification / task-message 注入的 user 消息按信封前缀识别为系统来源。
 */

const SYSTEM_ENVELOPES = ['[task-notification]', '[task-message]'] as const;

/** assistant 条目的工具调用元素（toolResult 并入的目标形状）。 */
type AssistantToolCall = Extract<HistoryItem, { kind: 'assistant' }>['toolCalls'][number];

export function mapEntries(entries: unknown): { items: HistoryItem[]; cursor: string | null } {
  const list = Array.isArray(entries) ? entries : [];
  const items: HistoryItem[] = [];
  // toolCallId → 最近一个 assistant HistoryItem 的 toolCalls 数组引用（后续 toolResult 并入）
  const pendingTools = new Map<string, AssistantToolCall[]>();
  let cursor: string | null = null;

  for (const raw of list) {
    const entry = recordOf(raw);
    const id = str(entry.id);
    if (id.length === 0) continue;
    cursor = id;
    if (entry.type !== 'message') continue;
    const message = recordOf(entry.message);
    const role = message.role;
    if (role === 'user') {
      const text = flattenUserText(message.content);
      items.push({ kind: 'user', id, text, origin: systemOrigin(text) ? 'system' : 'user' });
      pendingTools.clear();
      continue;
    }
    if (role === 'bashExecution') {
      items.push({
        kind: 'bash',
        id,
        command: str(message.command),
        output: str(message.output),
        exitCode: num(message.exitCode, 0),
        cancelled: message.cancelled === true,
      });
      continue;
    }
    if (role === 'toolResult') {
      // 并入所属 assistant 条目的同名 toolCall（按 id 原位更新）；找不到（异常序）则丢弃
      const callId = str(message.toolCallId);
      const target = pendingTools.get(callId);
      if (target === undefined) continue;
      const name = str(message.toolName);
      const diff = name === 'edit' ? editDiffOf(message) : null;
      for (let index = 0; index < target.length; index += 1) {
        const call = target[index];
        if (call === undefined || call.id !== callId) continue;
        target[index] = {
          id: callId,
          name: call.name.length > 0 ? call.name : name,
          argsPreview: call.argsPreview,
          output: toolResultText(message.content),
          isError: message.isError === true,
          // write 的 diff 来自参数（执行前已知），toolResult 无 diff 不得清掉
          diff: diff ?? call.diff,
        };
        break;
      }
      continue;
    }
    if (role === 'assistant') {
      const toolCallViews = assistantToolCalls(message.content).map((call) => ({
        id: call.id,
        name: call.name,
        argsPreview: previewArgs(call.args),
        output: '',
        isError: false,
        diff: call.name === 'write' ? writeDiffOf(call.args) : null,
      }));
      items.push({
        kind: 'assistant',
        id,
        text: assistantText(message.content),
        thinking: assistantThinking(message.content),
        toolCalls: toolCallViews,
        usage: usageOf(message.usage),
      });
      if (toolCallViews.length > 0) {
        for (const call of toolCallViews) pendingTools.set(call.id, toolCallViews);
      }
      continue;
    }
  }

  return { items, cursor };
}

function systemOrigin(text: string): boolean {
  return SYSTEM_ENVELOPES.some((envelope) => text.startsWith(envelope));
}

function editDiffOf(message: Record<string, unknown>): { path: string; additions: number; deletions: number }[] | null {
  const view = diffFromPatch(recordOf(message.details).patch);
  return view === null ? null : [view];
}

function writeDiffOf(args: Record<string, unknown>): { path: string; additions: number; deletions: number }[] | null {
  const view = diffFromWriteArgs(args);
  return view === null ? null : [view];
}

function usageOf(usage: unknown): { input: number; output: number } | null {
  const u = recordOf(usage);
  const input = u.input;
  const output = u.output;
  if (typeof input !== 'number' || typeof output !== 'number') return null;
  return { input, output };
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function num(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function recordOf(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}
