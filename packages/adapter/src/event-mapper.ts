import type { UiEvent, UsageView } from '@paiapp/contracts';

import { previewArgs } from './args-preview';
import { diffFromToolCall } from './diff-extract';
import { subagentsField } from './subagent-spawns';

/**
 * x-harness hub event 帧 → UiEvent（渲染层流式装饰）。
 *
 * 归属判定：帧级 agentName 在场 = 子归属帧（桥播种 session→agentId 映射；agentName
 * 即 agentId）；缺席 = 主会话路径，且 session 域帧再验 payload.session === threadId
 * （双保险——子会话 WAL 帧不进主时间线）。
 *
 * 有状态映射：流式增量无消息 id 与权威终快照——本映射器按线程维护流式累积态
 * （(turn, step) 对变化即重置缓冲并开新 message），渲染层的 messageFinal 语义
 * （整体替换增量缓冲）由 WAL assistant/message 权威终局保证。
 *
 * 显式忽略清单（渲染无直接消费，或由别的事件/对账路径覆盖）：
 * llm/chunk 的 tool-call-delta/finish（toolCallAdded 源 = WAL tool/call——参数
 *   集齐即现；步终局以 WAL assistant/message 为准）
 * turn/end（终态以 settled 为准——worker 死亡 host 合成，无悬挂）
 * agent/inbox/spliced（结构信号：主进程层拉取 get_state.queue 合成 queueChanged）
 * permission/decided（审计事件；对话框交互面是 ui_request 帧）
 * user/message、step/start|end、system/message、assistant/attempt、request/*、
 *   session/*、todo/snapshot、command/run|done、autocompact/*（前向兼容忽略）
 * agent/error（终态经 settled/turn/end 收敛）
 */

export interface EventMapDeps {
  now(): number;
}

/** 线程内流式累积态：(turn, step) 步边界之间的 llm/chunk 事实。 */
interface StreamBuffer {
  messageId: string;
  turn: number;
  step: number;
  text: string;
  thinking: string;
  usage: UsageView | null;
}

/** 映射器实例的流式累积域（per-mapper 状态；calls = callId→工具名，tool/result 无名字段——diff 提取靠它回查）。 */
interface StreamState {
  streams: Map<string, StreamBuffer>;
  calls: Map<string, string>;
  counter: number;
}

export interface EventMapper {
  /** event 帧（name/payload 展开 + 子代理中继身份）→ UiEvent 列表。 */
  mapEvent(frame: { threadId: string; name: string; payload: Record<string, unknown>; agentName?: string }): UiEvent[];
}

export function createEventMapper(deps: EventMapDeps): EventMapper {
  const state: StreamState = { streams: new Map(), calls: new Map(), counter: 0 };

  return {
    mapEvent(frame): UiEvent[] {
      const { threadId, name, payload } = frame;
      if (frame.agentName !== undefined && frame.agentName !== '') {
        return mapSubagent(threadId, name, payload, frame.agentName);
      }
      // 主会话谓词：session 域帧的 session 必须 === threadId（子会话 WAL 帧不进主时间线）
      const session = payload['session'];
      if (typeof session === 'string' && session !== threadId) return [];
      switch (name) {
        case 'turn/start':
          return [{ type: 'turnStarted', threadId, at: num(payload.time, deps.now()) }];
        case 'llm/chunk':
          return mapChunk(state, threadId, payload, deps);
        case 'assistant/message': {
          const buffer = state.streams.get(threadId);
          return [
            {
              type: 'messageFinal',
              threadId,
              message: { id: buffer?.messageId ?? `stream-${++state.counter}`, text: messageText(payload.content), thinking: messageThinking(payload.content), toolCalls: [], usage: usageOf(payload.usage) },
            },
          ];
        }
        case 'tool/call': {
          const buffer = state.streams.get(threadId);
          const toolName = str(payload.name);
          const args = argsOf(payload.arguments);
          const callId = str(payload.callId);
          if (callId.length > 0) state.calls.set(callId, toolName);
          return [
            {
              type: 'toolCallAdded',
              threadId,
              messageId: buffer?.messageId ?? '',
              call: { id: callId, name: toolName, argsPreview: previewArgs(args), ...subagentsField(toolName, args) },
              diff: diffFromToolCall(toolName, args),
            },
          ];
        }
        case 'tool/result': {
          const callId = str(payload.callId);
          return [
            {
              type: 'toolEnded',
              threadId,
              callId,
              output: toolResultText(payload.content),
              isError: payload.isError === true,
              durationMs: 0,
              // diff 已在 tool/call 参数级提取（x-harness 结果侧无 patch 面）
              diff: null,
            },
          ];
        }
        case 'agent/tool-stream':
          return [{ type: 'toolUpdated', threadId, callId: str(payload.callId), output: str(payload.delta) }];
        case 'settled':
          state.streams.delete(threadId);
          return [
            {
              type: 'turnSettled',
              threadId,
              ok: payload.ok !== false,
              ...(payload.reason !== undefined && payload.reason !== '' ? { reason: str(payload.reason) } : {}),
              usage: null,
            },
          ];
        case 'compaction/landed':
          return [
            { type: 'compacting', threadId, active: false },
            { type: 'compacted', threadId, replacedCount: num(payload.replacedNodes, 0) },
          ];
        case 'llm/retry':
          return [{ type: 'retrying', threadId, attempt: num(payload.retry, 0), errorMessage: failureMessage(payload.failure) }];
        case 'bash_execution_update':
          return [
            {
              type: 'bashOutput',
              threadId,
              id: payload.id === undefined ? null : str(payload.id),
              delta: str(payload.delta),
              ...(payload.truncated === true ? { truncated: true } : {}),
            },
          ];
        case 'agent/spawned':
          return [
            {
              type: 'subagentStarted',
              threadId,
              agentId: str(payload.agentId),
              agentName: str(payload.type),
              task: str(payload.work),
            },
          ];
        case 'agent/finished':
          return [
            {
              type: 'subagentSettled',
              threadId,
              agentId: str(payload.agentId),
              status: str(payload.outcome),
            },
          ];
        default:
          return [];
      }
    },
  };
}

/** llm/chunk 增量：(turn, step) 变化即重置流缓冲（messageStarted 边界——无 per-message start 帧）。 */
function mapChunk(state: StreamState, threadId: string, payload: Record<string, unknown>, deps: EventMapDeps): UiEvent[] {
  const chunk = recordOf(payload.chunk);
  const kind = chunk['type'];
  const turn = num(payload.turn, -1);
  const step = num(payload.step, -1);
  let buffer = state.streams.get(threadId);
  const boundary = buffer === undefined || buffer.turn !== turn || buffer.step !== step;
  if (boundary && (kind === 'text-delta' || kind === 'thinking-delta')) {
    // 步边界开新缓冲；无缓冲的首增量（订阅窗口边界/竞争）同样开缓冲兜底，不丢单词
    state.counter += 1;
    buffer = { messageId: `stream-${state.counter}`, turn, step, text: '', thinking: '', usage: null };
    state.streams.set(threadId, buffer);
    const started: UiEvent = { type: 'messageStarted', threadId, messageId: buffer.messageId, at: deps.now() };
    return [started, ...emitChunk(threadId, buffer, chunk)];
  }
  if (buffer === undefined) return [];
  return emitChunk(threadId, buffer, chunk);
}

function emitChunk(threadId: string, buffer: StreamBuffer, chunk: Record<string, unknown>): UiEvent[] {
  const kind = chunk['type'];
  if (kind === 'text-delta') {
    const delta = str(chunk['text']);
    buffer.text += delta;
    return [{ type: 'textDelta', threadId, messageId: buffer.messageId, delta }];
  }
  if (kind === 'thinking-delta') {
    const delta = str(chunk['text']);
    buffer.thinking += delta;
    return [{ type: 'thinkingDelta', threadId, messageId: buffer.messageId, delta }];
  }
  if (kind === 'usage') {
    buffer.usage = usageOf(chunk['usage']);
  }
  return [];
}

/** 子归属帧（agentName = agentId）：正文流 + 工具面 + 状态域。 */
function mapSubagent(threadId: string, name: string, payload: Record<string, unknown>, agentId: string): UiEvent[] {
  switch (name) {
    case 'agent/assistant-stream': {
      const frame = recordOf(payload.frame);
      if (frame['phase'] === 'chunk' && frame['kind'] === 'text') {
        return [{ type: 'subagentDelta', threadId, agentId, delta: str(frame['text']) }];
      }
      return [];
    }
    case 'agent/tool-stream':
      return [
        {
          type: 'subagentTool',
          threadId,
          agentId,
          call: { id: str(payload.callId), name: '', argsPreview: '' },
          phase: 'update',
          output: str(payload.delta),
        },
      ];
    case 'tool/call': {
      const toolName = str(payload.name);
      const args = argsOf(payload.arguments);
      return [
        {
          type: 'subagentTool',
          threadId,
          agentId,
          call: { id: str(payload.callId), name: toolName, argsPreview: previewArgs(args) },
          phase: 'start',
        },
      ];
    }
    case 'tool/result':
      return [
        {
          type: 'subagentTool',
          threadId,
          agentId,
          call: { id: str(payload.callId), name: str(payload.name), argsPreview: '' },
          phase: 'end',
          output: toolResultText(payload.content),
          isError: payload.isError === true,
        },
      ];
    case 'agent/status':
      return [{ type: 'subagentState', threadId, agentId, busy: str(payload.status) === 'running' }];
    default:
      return [];
  }
}

/** 内核 usage {input, output, …} → 视图 {input, output}。 */
function usageOf(usage: unknown): UsageView | null {
  const u = recordOf(usage);
  const input = u['input'];
  const output = u['output'];
  if (typeof input !== 'number' || typeof output !== 'number') return null;
  return { input, output };
}

/** tool/call arguments（JSON 字符串或对象）→ 宽容解析的参数对象。 */
function argsOf(value: unknown): Record<string, unknown> {
  if (typeof value !== 'string' || value.length === 0) return recordOf(value);
  try {
    const parsed: unknown = JSON.parse(value);
    return recordOf(parsed);
  } catch {
    return {};
  }
}

/** WAL assistant/message content 块提取（text/thinking 拼接）。 */
function messageText(content: unknown): string {
  return contentBlocks(content, 'text');
}

function messageThinking(content: unknown): string {
  return contentBlocks(content, 'thinking');
}

function contentBlocks(content: unknown, type: string): string {
  if (!Array.isArray(content)) return '';
  const parts: string[] = [];
  for (const block of content) {
    if (typeof block === 'object' && block !== null && (block as Record<string, unknown>)['type'] === type) {
      const text = (block as Record<string, unknown>)['text'];
      if (typeof text === 'string') parts.push(text);
    }
  }
  return parts.join('\n');
}

function failureMessage(failure: unknown): string {
  const f = recordOf(failure);
  const message = str(f.message);
  const code = str(f.code);
  if (message.length > 0 && code.length > 0) return `${message} (${code})`;
  return message.length > 0 ? message : code;
}

function toolResultText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  const parts: string[] = [];
  for (const block of content) {
    if (typeof block === 'object' && block !== null && (block as Record<string, unknown>)['type'] === 'text') {
      const text = (block as Record<string, unknown>)['text'];
      if (typeof text === 'string') parts.push(text);
    }
  }
  return parts.join('\n');
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
