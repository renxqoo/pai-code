import type { UiEvent, UsageView } from '@paiapp/contracts';

import { previewArgs } from '../views/args-preview';
import { diffFromToolCall } from '../views/diff-extract';
import { subagentsField } from '../views/subagent-spawns';

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
 * turn/end（主会话轮终局兜底：合成 turnSettled——内部驱动轮（delegation notify）
 *   无 hub settled 债务，不合成则 loading 永挂；驱动轮的 settled 随后被去重吞掉）
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
  /** callId → 工具名（按 owner 隔离：主会话与各子代理各持一桶——子代理后台跨父轮
   *  运行，父轮结算不得清子的累积，与 hub 桥侧 owner 键语义对齐） */
  calls: Map<string, Map<string, string>>;
  /** callId → 工具输出累积（agent/tool-stream 增量批；owner 隔离同上） */
  toolStreams: Map<string, Map<string, string>>;
  /** threadId → 已由 turn/end 合成结算（同轮后续 settled 帧吞掉防双结算） */
  settledSynth: Set<string>;
  counter: number;
}

/** owner 桶键：主会话 = t:<threadId>；子代理 = s:<threadId>:<agentId>。 */
const mainKeyOf = (threadId: string): string => `t:${threadId}`;
const subagentKeyOf = (threadId: string, agentId: string): string => `s:${threadId}:${agentId}`;

function ownerBucket<V>(table: Map<string, Map<string, V>>, ownerKey: string): Map<string, V> {
  const existing = table.get(ownerKey);
  if (existing !== undefined) return existing;
  const created = new Map<string, V>();
  table.set(ownerKey, created);
  return created;
}

/** 该线程的全部 owner 桶键（主会话 + 所有子代理）——会话终结清理用。 */
function threadBucketKeys(state: StreamState, threadId: string): string[] {
  const main = `t:${threadId}`;
  const prefix = `s:${threadId}:`;
  return [...state.toolStreams.keys(), ...state.calls.keys()].filter((key) => key === main || key.startsWith(prefix));
}

export interface EventMapper {
  /** event 帧（name/payload 展开 + 子代理中继身份）→ UiEvent 列表。 */
  mapEvent(frame: { threadId: string; name: string; payload: Record<string, unknown>; agentName?: string }): UiEvent[];
  /** 会话终结（移除/强退/收编/worker 死亡）：清该线程的全部流式累积态（无界增长防线）。 */
  dispose(threadId: string): void;
}

/** session 域帧归属键（主会话谓词单一真相）：payload.session 为字符串即归属
 *  threadId 的判定源；缺席/非字符串 = 无归属信息（由调用方各自语义处置）。 */
export function payloadSessionOf(payload: Record<string, unknown>): string | undefined {
  const session = payload['session'];
  return typeof session === 'string' ? session : undefined;
}

export function createEventMapper(deps: EventMapDeps): EventMapper {
  const state: StreamState = { streams: new Map(), calls: new Map(), toolStreams: new Map(), settledSynth: new Set(), counter: 0 };

  return {
    dispose(threadId: string): void {
      state.streams.delete(threadId);
      state.settledSynth.delete(threadId);
      for (const key of threadBucketKeys(state, threadId)) {
        state.toolStreams.delete(key);
        state.calls.delete(key);
      }
    },
    mapEvent(frame): UiEvent[] {
      const { threadId, name, payload } = frame;
      if (frame.agentName !== undefined && frame.agentName !== '') {
        return mapSubagent(state, threadId, name, payload, frame.agentName);
      }
      // 主会话谓词：session 域帧的 session 必须 === threadId（子会话 WAL 帧不进主时间线）
      const session = payloadSessionOf(payload);
      if (session !== undefined && session !== threadId) return [];
      switch (name) {
        case 'turn/start':
          state.settledSynth.delete(threadId);
          return [{ type: 'turnStarted', threadId, at: num(payload.time, deps.now()) }];
        case 'turn/end': {
          // 内部驱动轮（delegation notify 等）无 hub settled：turn/end 权威终局就地合成
          // turnSettled（error/blocked → ok:false，reason 透传），loading 不再悬挂。
          // 驱动轮的 settled 帧随后到达时被 settledSynth 吞掉——fold 的 settle 幂等，
          // 双结算虽无害但失败通报/窗口重建会双跑，去重更稳。门闩随 turn/start 重置。
          state.streams.delete(threadId);
          state.settledSynth.add(threadId);
          const reason = recordOf(payload.reason);
          const kind = str(reason['kind']);
          const ok = kind !== 'error' && kind !== 'blocked';
          const detail = kind === 'error' ? str(reason['message']) : kind === 'blocked' ? str(reason['reason']) : '';
          return [{ type: 'turnSettled', threadId, ok, ...(ok ? {} : detail.length > 0 ? { reason: detail } : { reason: kind }), usage: null }];
        }
        case 'llm/chunk':
          return mapChunk(state, threadId, payload, deps);
        case 'agent/assistant-stream': {
          // 主会话 attempt 边界（内核 runAttempt 流失败重试在同 turn/step 内从头发
          // 第二段流——llm/chunk 面无重开标记）：phase:'start' 与当前缓冲同一步时
          // 才是重开——重置流缓冲并广播 streamRestarted，fold 清空当前流块，失败
          // attempt 的半截文本被替换不叠加。工具循环下一 step 的 start（步坐标不
          // 同步）是正常步边界：旧步块已由 messageFinal 权威替换，不得触碰，新步
          // 缓冲由 mapChunk 的步坐标边界自行开
          const streamFrame = recordOf(payload.frame);
          if (streamFrame['phase'] !== 'start') return [];
          const buffer = state.streams.get(threadId);
          if (buffer === undefined) return [];
          if (buffer.turn !== num(payload.turn, -1) || buffer.step !== num(payload.step, -1)) return [];
          buffer.text = '';
          buffer.thinking = '';
          return [{ type: 'streamRestarted', threadId, messageId: buffer.messageId }];
        }
        case 'assistant/message': {
          // 步坐标以 WAL 权威事件为准更新缓冲（E-H4：无文本步不复用陈旧缓冲——
          // 事件自带 turn/step，比对后重置；thinking 是内核顶层字段非 content 块）
          const turn = num(payload.turn, -1);
          const step = num(payload.step, -1);
          let buffer = state.streams.get(threadId);
          if (buffer === undefined || buffer.turn !== turn || buffer.step !== step) {
            state.counter += 1;
            buffer = { messageId: `stream-${state.counter}`, turn, step, text: '', thinking: '', usage: null };
            state.streams.set(threadId, buffer);
          }
          return [
            {
              type: 'messageFinal',
              threadId,
              message: { id: buffer.messageId, text: messageText(payload.content), thinking: str(payload.thinking), toolCalls: [], usage: usageOf(payload.usage) },
            },
          ];
        }
        case 'tool/call': {
          const buffer = state.streams.get(threadId);
          const toolName = str(payload.name);
          const args = argsOf(payload.arguments);
          const callId = str(payload.callId);
          if (callId.length > 0) ownerBucket(state.calls, mainKeyOf(threadId)).set(callId, toolName);
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
          ownerBucket(state.toolStreams, mainKeyOf(threadId)).delete(callId);
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
        case 'agent/tool-stream': {
          // 桥发增量批（≥25ms 尾沿合并的 delta）——UiEvent toolUpdated 是快照语义，
          // 协议边界按 callId 累积（tool/result 结算时冲净，见下）
          const callId = str(payload.callId);
          const delta = str(payload.delta);
          const bucket = ownerBucket(state.toolStreams, mainKeyOf(threadId));
          const accumulated = (bucket.get(callId) ?? '') + delta;
          bucket.set(callId, accumulated);
          return [{ type: 'toolUpdated', threadId, callId, output: accumulated }];
        }
        case 'settled':
          if (state.settledSynth.delete(threadId)) return []; // turn/end 已合成过本轮结算
          state.streams.delete(threadId);
          // 轮结算清本线程主会话的记忆桶（callId→工具名 / callId→累积输出）：跨轮
          // callId 不复用，长会话生命周期内无界增长即泄漏。只清主会话桶——子代理
          // 后台跨父轮运行，其累积由自身 tool/result 与会话终结（dispose）清理
          state.toolStreams.delete(mainKeyOf(threadId));
          state.calls.delete(mainKeyOf(threadId));
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
function mapSubagent(state: StreamState, threadId: string, name: string, payload: Record<string, unknown>, agentId: string): UiEvent[] {
  switch (name) {
    case 'agent/assistant-stream': {
      const frame = recordOf(payload.frame);
      if (frame['phase'] === 'chunk' && frame['kind'] === 'text') {
        return [{ type: 'subagentDelta', threadId, agentId, delta: str(frame['text']) }];
      }
      return [];
    }
    case 'agent/tool-stream': {
      const callId = str(payload.callId);
      const bucket = ownerBucket(state.toolStreams, subagentKeyOf(threadId, agentId));
      const accumulated = (bucket.get(callId) ?? '') + str(payload.delta);
      bucket.set(callId, accumulated);
      return [
        {
          type: 'subagentTool',
          threadId,
          agentId,
          call: { id: callId, name: '', argsPreview: '' },
          phase: 'update',
          output: accumulated,
        },
      ];
    }
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
      ownerBucket(state.toolStreams, subagentKeyOf(threadId, agentId)).delete(str(payload.callId));
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
