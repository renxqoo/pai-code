/**
 * host-hub event 帧事件词表与载荷（x-harness 词表：session 域 WAL 镜像 + 实时域 +
 * worker 合成域）。规格真相源 = x-harness 仓库 worker/event-bridge 订阅清单与各
 * tokens 定义。归属判定：session 域帧 payload 带 session（主会话谓词 =
 * payload.session === threadId，等价帧级 agentName 缺席）；子归属帧另带 agentName
 * （=agentId）。app 只消费 HUB_EVENT_NAMES 子集，其余事件名一律忽略（前向兼容）。
 */

// ============================================================================
// Event 帧事件词表与载荷（x-harness session 域 + 实时域 + worker 合成域）
// ============================================================================

/** llm/chunk 载荷（仅主会话外发；替代旧 assistant/stream——无 per-message start 帧，
 *  messageStarted 边界 = (turn, step) 对变化）。 */
export type LlmChunk =
  | { type: 'text-delta'; text: string }
  | { type: 'thinking-delta'; text: string }
  | { type: 'tool-call-delta'; callId?: string; name?: string; argumentsDelta?: string }
  | { type: 'usage'; usage: { input: number; output: number; totalTokens: number } }
  | { type: 'finish'; finish: { kind: 'stop' | 'max-tokens' | 'error'; message?: string; code?: string } };

/** session 域壳（WAL 镜像统一包裹；session = 所属会话 id——主会话谓词判据）。 */
export interface SessionEnvelope {
  seq: number;
  time: number;
  session: string;
}

/** turn/end reason 判别联合（settled ok 语义已由 hub 归一，app 透传展示）。 */
export type TurnEndReason =
  | { kind: 'completed' }
  | { kind: 'aborted'; cause?: string }
  | { kind: 'blocked'; reason?: string }
  | { kind: 'error'; message: string; code?: string }
  | { kind: 'max-tokens' }
  | { kind: 'interrupted' };

/** agent/spawned|finished 载荷（键 agentId；spawned 的 work = 任务摘要，复活发射可能缺席）。 */
export interface AgentSpawnedEvent {
  parent: string;
  agentId: string;
  sessionId: string;
  type: string;
  depth: number;
  work?: string;
}

export interface AgentFinishedEvent {
  parent: string;
  agentId: string;
  sessionId: string;
  outcome: 'completed' | 'stopped' | 'failed';
  detail: string;
  summary?: string;
}

/** agent/assistant-stream 帧（子代理模型增量；帧带 agentName 归属）。 */
export interface AgentStreamFrame {
  session: string;
  turn: number;
  step: number;
  frame: { phase: 'start' | 'chunk' | 'end'; kind: 'text' | 'thinking'; text: string };
}

/** app 消费的事件名词表（x-harness 还会发 request/*、system/message、
 *  assistant/attempt、session/*、command/run|done、autocompact/*、
 *  compaction/served-window|diagnostic、agent/error、step/start|end——一律忽略）。
 *  turn/end：主会话轮终局兜底源（内部驱动轮无 settled 债务——event-mapper 就地
 *  合成 turnSettled；驱动轮的 settled 帧随后到达被去重）。
 *  todo/snapshot：todo 清单全量快照（载荷 = TodoSnapshotEventData；速览面板
 *  进程区数据源，last-wins）。 */
export type HubEventName =
  | 'turn/start'
  | 'turn/end'
  | 'user/message'
  | 'assistant/message'
  | 'tool/call'
  | 'tool/result'
  | 'llm/retry'
  | 'agent/inbox/spliced'
  | 'llm/chunk'
  | 'agent/assistant-stream'
  | 'agent/tool-stream'
  | 'agent/status'
  | 'agent/spawned'
  | 'agent/finished'
  | 'compaction/landed'
  | 'permission/decided'
  | 'settled'
  | 'todo/snapshot'
  | 'bash_execution_update';

export const HUB_EVENT_NAMES = [
  'turn/start',
  'turn/end',
  'user/message',
  'assistant/message',
  'tool/call',
  'tool/result',
  'llm/retry',
  'agent/inbox/spliced',
  'llm/chunk',
  'agent/assistant-stream',
  'agent/tool-stream',
  'agent/status',
  'agent/spawned',
  'agent/finished',
  'compaction/landed',
  'permission/decided',
  'settled',
  'todo/snapshot',
  'bash_execution_update',
] as const;

// 编译期封闭断言：事件词表与类型联合双向绑定（漂移即编译失败）。
type CoversUnion<T, U extends T> = [T] extends [U] ? unknown : never;
const _hubEventNamesCover = null as unknown as CoversUnion<HubEventName, (typeof HUB_EVENT_NAMES)[number]>;
void _hubEventNamesCover;
