import type { UiEvent, UsageView } from '@paiapp/contracts';

import { previewArgs } from './args-preview';
import { diffFromToolCall, diffFromToolResult } from './diff-extract';
import { subagentsField } from './subagent-spawns';

/**
 * host-hub event 帧事件 → UiEvent（渲染层流式装饰）。
 *
 * 有状态映射：assistant/stream 的增量在 hub 侧无消息 id 与权威终快照——
 * 本映射器按线程维护流式累积态（start 开缓冲、done 出权威 messageFinal），
 * 渲染层的 messageFinal 语义（整体替换增量缓冲）由此保证。
 * 需要时刻的事件注入时钟；跨事件记忆的事实（如工具时长）由渲染层折叠。
 *
 * 显式忽略清单（渲染无直接消费，或由别的事件/对账路径覆盖）：
 * assistant/stream 的 start/thinking_start|end/text_start|end/tool_use_* 段
 *   （块边界由 text/thinking 增量自明；工具参数以 tool/start 的完整 input 为准）
 * assistant/stream 的 usage/error 段（usage 并入 done 的 messageFinal；
 *   硬错误经 settled{ok:false} 呈现，可重试错误走 llm/retry）
 * turn/end（终态以 settled 为准——worker 死亡 host 合成，无悬挂）
 * inbox/spliced（结构信号：主进程层拉取 get_state.queue 合成 queueChanged）
 * permission/decision（审计事件；对话框交互面是 ui_request 帧）
 * step/start|end、hook/error、request/start、plugin/*（前向兼容忽略）
 * agents/idle（manager 聚合域，面板态走 agents/state）
 * agents/user-injected（无面板语义）
 */

export interface EventMapDeps {
  now(): number;
}

/** 线程内流式累积态：assistant/stream start→done 之间的事实。 */
interface StreamBuffer {
  messageId: string;
  text: string;
  thinking: string;
  usage: UsageView | null;
}

/** 映射器实例的流式累积域（per-mapper 状态；mapStream 模块函数经此访问）。 */
interface StreamState {
  streams: Map<string, StreamBuffer>;
  counter: number;
}

export interface EventMapper {
  /** event 帧（name/payload 展开 + 子代理中继身份）→ UiEvent 列表。 */
  mapEvent(frame: { threadId: string; name: string; payload: Record<string, unknown>; agentName?: string }): UiEvent[];
}

export function createEventMapper(deps: EventMapDeps): EventMapper {
  const state: StreamState = { streams: new Map(), counter: 0 };

  return {
    mapEvent(frame): UiEvent[] {
      const { threadId, name, payload } = frame;
      if (frame.agentName !== undefined && frame.agentName !== '') {
        return mapSubagent(threadId, name, payload, frame.agentName);
      }
      switch (name) {
        case 'turn/start':
          return [{ type: 'turnStarted', threadId, at: num(payload.ts, deps.now()) }];
        case 'assistant/stream':
          return mapStream(state, threadId, payload, deps);
        case 'tool/start': {
          const buffer = state.streams.get(threadId);
          if (buffer === undefined) return [];
          const toolUseId = str(payload.toolUseId);
          const toolName = str(payload.toolName);
          const args = recordOf(payload.input);
          return [
            {
              type: 'toolCallAdded',
              threadId,
              messageId: buffer.messageId,
              call: { id: toolUseId, name: toolName, argsPreview: previewArgs(args), ...subagentsField(toolName, args) },
              diff: diffFromToolCall(toolName, args),
            },
          ];
        }
        case 'tool/progress':
          return [{ type: 'toolUpdated', threadId, callId: str(payload.toolUseId), output: str(payload.delta) }];
        case 'tool/result':
          return [
            {
              type: 'toolEnded',
              threadId,
              callId: str(payload.toolUseId),
              output: toolResultText(payload.content),
              isError: payload.isError === true,
              durationMs: num(payload.durationMs, 0),
              diff: diffFromToolResult(str(payload.toolName), payload),
            },
          ];
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
        case 'compaction':
          return [
            { type: 'compacting', threadId, active: false },
            { type: 'compacted', threadId, replacedCount: num(payload.replacedCount, 0) },
          ];
        case 'llm/retry':
          return [{ type: 'retrying', threadId, attempt: num(payload.attempt, 0), errorMessage: str(payload.reason) }];
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
        default:
          return [];
      }
    },
  };
}

function beginStream(state: StreamState): StreamBuffer {
  state.counter += 1;
  return { messageId: `stream-${state.counter}`, text: '', thinking: '', usage: null };
}

function mapStream(state: StreamState, threadId: string, payload: Record<string, unknown>, deps: EventMapDeps): UiEvent[] {
  const kind = payload['type'];
  let buffer = state.streams.get(threadId);
  if (buffer === undefined && (kind === 'start' || kind === 'text' || kind === 'thinking')) {
    // start 开缓冲；无 start 的增量（订阅窗口边界/竞争）同样开缓冲兜底，不丢单词
    buffer = beginStream(state);
    state.streams.set(threadId, buffer);
    return [
      { type: 'messageStarted', threadId, messageId: buffer.messageId, at: deps.now() },
      ...mapStream(state, threadId, payload, deps),
    ];
  }
  if (buffer === undefined) return [];
  if (kind === 'text') {
    const delta = str(payload.text);
    buffer.text += delta;
    return [{ type: 'textDelta', threadId, messageId: buffer.messageId, delta }];
  }
  if (kind === 'thinking') {
    const delta = str(payload.text);
    buffer.thinking += delta;
    return [{ type: 'thinkingDelta', threadId, messageId: buffer.messageId, delta }];
  }
  if (kind === 'usage') {
    buffer.usage = usageOf(payload.usage);
    return [];
  }
  if (kind === 'done') {
    return [
      {
        type: 'messageFinal',
        threadId,
        message: { id: buffer.messageId, text: buffer.text, thinking: buffer.thinking, toolCalls: [], usage: buffer.usage },
      },
    ];
  }
  return [];
}

/** 子代理中继事件（帧级 agentName 分流）：正文流 + 工具面 + agents/* 域。 */
function mapSubagent(threadId: string, name: string, payload: Record<string, unknown>, agentName: string): UiEvent[] {
  switch (name) {
    case 'assistant/stream':
      if (payload['type'] === 'text') {
        return [{ type: 'subagentDelta', threadId, agentName, delta: str(payload['text']) }];
      }
      return [];
    case 'tool/start': {
      const toolName = str(payload.toolName);
      const args = recordOf(payload.input);
      return [
        {
          type: 'subagentTool',
          threadId,
          agentName,
          call: { id: str(payload.toolUseId), name: toolName, argsPreview: previewArgs(args) },
          phase: 'start',
        },
      ];
    }
    case 'tool/progress':
      return [
        {
          type: 'subagentTool',
          threadId,
          agentName,
          call: { id: str(payload.toolUseId), name: str(payload.toolName), argsPreview: '' },
          phase: 'update',
          output: str(payload.delta),
        },
      ];
    case 'tool/result':
      return [
        {
          type: 'subagentTool',
          threadId,
          agentName,
          call: { id: str(payload.toolUseId), name: str(payload.toolName), argsPreview: '' },
          phase: 'end',
          output: toolResultText(payload.content),
          isError: payload.isError === true,
        },
      ];
    case 'agents/spawned':
      return [{ type: 'subagentStarted', threadId, agentId: str(payload.agentId), agentName: str(payload.agentName), task: '' }];
    case 'agents/state':
      return [{ type: 'subagentState', threadId, agentName: str(payload.agentName), busy: payload.to === 'busy' }];
    case 'agents/terminal':
      return [{ type: 'subagentSettled', threadId, agentName: str(payload.agentName), status: str(payload.status) }];
    case 'agents/evicted':
      return [{ type: 'subagentSettled', threadId, agentName: str(payload.agentName), status: 'evicted' }];
    case 'agents/permission-ask':
      return [
        {
          type: 'subagentAsk',
          threadId,
          agentName: str(payload.agentName),
          toolName: str(payload.toolName),
          summary: str(payload.summary),
          ...(payload.reason !== undefined ? { reason: str(payload.reason) } : {}),
        },
      ];
    default:
      return [];
  }
}

/** 内核 usage {inputTokens, outputTokens} → 视图 {input, output}。 */
function usageOf(usage: unknown): UsageView | null {
  const u = recordOf(usage);
  const input = u['inputTokens'];
  const output = u['outputTokens'];
  if (typeof input !== 'number' || typeof output !== 'number') return null;
  return { input, output };
}

function toolResultText(content: unknown): string {
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
