import type { AgentSessionEvent, SubagentEventFrame, UiEvent, UsageView } from '@paiapp/contracts';

import { assistantText, assistantThinking, assistantToolCalls, toolResultText } from './content';
import { previewArgs } from './args-preview';
import { diffFromToolCall, diffFromToolResult } from './diff-extract';

/**
 * AgentSessionEvent → UiEvent（渲染层流式装饰）。
 * 无状态映射：需要时刻的事件注入时钟；需要跨事件记忆的事实（如时长）由渲染层折叠。
 *
 * 显式忽略清单（渲染无直接消费，或由别的事件/对账路径覆盖）：
 * turn_start / turn_end（message 粒度已覆盖）
 * message_update 的 message_start 段外字段（pai-cli toWireEvent 剥离 message/partial，
 *   增量 id 由渲染层以 liveMessageId 兜底，见 fold-events）
 * tool_execution_start（执行时长以渲染层到达时刻观测；args 已由 toolcall_end 携带）
 * agent_end（auto-retry 会多次触发；终态以 agent_settled 为准）
 * message_update 的 start/end/done/error 段（text/thinking/toolcall 三类增量已覆盖；
 *   段边界由渲染层按 contentIndex 语义重建，权威内容走 messageFinal）
 * auto_retry_end（下一次 messageStarted / turnSettled 清除重试提示）
 * entry_appended（仅扩展自定义条目；对话条目真相走 get_entries 对账）
 * summarization_retry_*（压缩内部重试，过程不进对话流）
 * thinking_level_changed / model 变更（sessionUpdated 快照携带）
 */

export interface EventMapDeps {
  now(): number;
}

export function mapSessionEvent(threadId: string, raw: AgentSessionEvent, deps: EventMapDeps): UiEvent[] {
  switch (raw.type) {
    case 'agent_start':
      return [{ type: 'turnStarted', threadId, at: deps.now() }];
    case 'message_start': {
      // pi 对 user/toolResult 消息同样发 message_start/end（agent-loop 全消息发射），
      // 只有 assistant 消息参与流式渲染
      if (!isAssistant(raw.message)) return [];
      return [{ type: 'messageStarted', threadId, messageId: messageIdOf(raw.message), at: deps.now() }];
    }
    case 'message_update':
      return mapMessageUpdate(threadId, raw);
    case 'message_end': {
      if (!isAssistant(raw.message)) return [];
      return [mapMessageEnd(threadId, raw.message)];
    }
    case 'tool_execution_update':
      return [{ type: 'toolUpdated', threadId, callId: str(raw.toolCallId), output: partialOutput(raw.partialResult) }];
    case 'tool_execution_end':
      return [
        {
          type: 'toolEnded',
          threadId,
          callId: str(raw.toolCallId),
          output: partialOutput(raw.result),
          isError: raw.isError === true,
          durationMs: 0,
          diff: diffFromToolResult(str(raw.toolName), raw.result),
        },
      ];
    case 'agent_settled':
      return [{ type: 'turnSettled', threadId, usage: null }];
    case 'queue_update':
      return [
        {
          type: 'queueChanged',
          threadId,
          steering: strList(raw.steering),
          followUp: strList(raw.followUp),
        },
      ];
    case 'compaction_start':
      return [{ type: 'compacting', threadId, active: true }];
    case 'compaction_end':
      return [{ type: 'compacting', threadId, active: false }];
    case 'auto_retry_start':
      return [
        {
          type: 'retrying',
          threadId,
          attempt: num(raw.attempt, 0),
          maxAttempts: num(raw.maxAttempts, 0),
          errorMessage: str(raw.errorMessage),
        },
      ];
    case 'session_info_changed':
      return [{ type: 'sessionRenamed', threadId, name: typeof raw.name === 'string' && raw.name.length > 0 ? raw.name : null }];
    case 'bash_execution_update':
      return [{ type: 'bashOutput', threadId, id: optStr(raw.id), delta: str(raw.delta) }];
    default:
      return [];
  }
}

function mapMessageUpdate(threadId: string, raw: AgentSessionEvent): UiEvent[] {
  const segment = raw.assistantMessageEvent as Record<string, unknown> | undefined;
  if (segment === undefined) return [];
  const kind = segment['type'];
  const messageId = segmentMessageId(raw);
  if (kind === 'text_delta') {
    return [{ type: 'textDelta', threadId, messageId, delta: str(segment['delta']) }];
  }
  if (kind === 'thinking_delta') {
    return [{ type: 'thinkingDelta', threadId, messageId, delta: str(segment['delta']) }];
  }
  if (kind === 'toolcall_end') {
    const toolCall = segment['toolCall'] as Record<string, unknown> | undefined;
    if (toolCall === undefined) return [];
    const args = recordOf(toolCall['arguments']);
    const name = str(toolCall['name']);
    return [
      {
        type: 'toolCallAdded',
        threadId,
        messageId,
        call: { id: str(toolCall['id']), name, argsPreview: previewArgs(args) },
        diff: diffFromToolCall(name, args),
      },
    ];
  }
  return [];
}

function mapMessageEnd(threadId: string, message: unknown): UiEvent {
  const m = recordOf(message);
  const toolCalls = assistantToolCalls(m['content']).map((call) => ({
    id: call.id,
    name: call.name,
    argsPreview: previewArgs(call.args),
  }));
  return {
    type: 'messageFinal',
    threadId,
    message: {
      id: messageIdOf(message),
      text: assistantText(m['content']),
      thinking: assistantThinking(m['content']),
      toolCalls,
      usage: usageOf(m['usage']),
    },
  };
}

export function mapSubagentEvent(frame: SubagentEventFrame): UiEvent[] {
  const { threadId, subagentId, agent, task, event } = frame;
  const header: UiEvent = { type: 'subagentStarted', threadId, subagentId, agent, task };
  switch (event.type) {
    case 'message_update': {
      const segment = event.assistantMessageEvent as Record<string, unknown> | undefined;
      const kind = segment?.['type'];
      if (kind === 'text_delta') {
        return [header, { type: 'subagentDelta', threadId, subagentId, delta: str(segment?.['delta']) }];
      }
      if (kind === 'toolcall_end') {
        const toolCall = recordOf(segment?.['toolCall']);
        const call = { id: str(toolCall['id']), name: str(toolCall['name']), argsPreview: previewArgs(recordOf(toolCall['arguments'])) };
        return [header, { type: 'subagentTool', threadId, subagentId, call, phase: 'end' }];
      }
      return [header];
    }
    case 'tool_execution_start': {
      const call = { id: str(event.toolCallId), name: str(event.toolName), argsPreview: previewArgs(recordOf(event.args)) };
      return [header, { type: 'subagentTool', threadId, subagentId, call, phase: 'start' }];
    }
    case 'tool_execution_update': {
      const call = { id: str(event.toolCallId), name: str(event.toolName), argsPreview: '' };
      return [header, { type: 'subagentTool', threadId, subagentId, call, phase: 'update', output: partialOutput(event.partialResult) }];
    }
    case 'tool_execution_end': {
      const call = { id: str(event.toolCallId), name: str(event.toolName), argsPreview: '' };
      return [
        header,
        {
          type: 'subagentTool',
          threadId,
          subagentId,
          call,
          phase: 'end',
          output: partialOutput(event.result),
          isError: event.isError === true,
        },
      ];
    }
    case 'agent_settled':
      return [header, { type: 'subagentSettled', threadId, subagentId }];
    case 'message_end': {
      // 子代理正文权威快照：完整文本替换增量缓冲；
      // 非 assistant 消息（user/toolResult）同样会发 message_end，必须过滤
      if (!isAssistant(event.message)) return [header];
      const text = assistantText(recordOf(event.message)['content']);
      return [header, { type: 'subagentDelta', threadId, subagentId, delta: '' }, { type: 'subagentText', threadId, subagentId, text }];
    }
    default:
      return [header];
  }
}

/** 消息标识：流式期间以 message.timestamp 为稳定 id（messageFinal 同源）。 */
function messageIdOf(message: unknown): string {
  const ts = recordOf(message)['timestamp'];
  return typeof ts === 'number' ? String(ts) : '';
}

function isAssistant(message: unknown): boolean {
  return recordOf(message)['role'] === 'assistant';
}

function segmentMessageId(raw: AgentSessionEvent): string {
  const partial = recordOf((recordOf(raw.assistantMessageEvent))['partial']);
  const fromPartial = partial['timestamp'];
  if (typeof fromPartial === 'number') return String(fromPartial);
  return messageIdOf(raw.message);
}

function usageOf(usage: unknown): UsageView | null {
  const u = recordOf(usage);
  const input = u['input'];
  const output = u['output'];
  if (typeof input !== 'number' || typeof output !== 'number') return null;
  return { input, output };
}

function partialOutput(result: unknown): string {
  const r = recordOf(result);
  return toolResultText(r['content']);
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function optStr(value: unknown): string | null | undefined {
  return typeof value === 'string' ? value : null;
}

function num(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function strList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function recordOf(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}
