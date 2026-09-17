/**
 * host-hub event 帧事件词表与载荷（内核域 + agents 域 + worker 合成域；从
 * hub-protocol 拆出保持行数预算）。规格真相源 = host-hub 仓库 event-bridge 与
 * 各发射点实现。
 */

// ============================================================================
// Event 帧事件词表与载荷（host-hub 内核域 + agents 域 + worker 合成域）
// ============================================================================

/** assistant/stream 增量（payload.type 判别；done = 步终局）。 */
export type StreamDelta =
  | { type: 'start' }
  | { type: 'thinking_start' }
  | { type: 'thinking'; text: string }
  | { type: 'thinking_end' }
  | { type: 'text_start' }
  | { type: 'text'; text: string }
  | { type: 'text_end' }
  | { type: 'tool_use_start'; id: string; name: string }
  | { type: 'tool_use_input'; id: string; inputDelta: string }
  | { type: 'tool_use_end'; id: string }
  | { type: 'usage'; usage: { inputTokens: number; outputTokens: number; totalTokens: number } }
  | { type: 'done'; stopReason: 'stop' | 'length' | 'tool_use' | 'error' | 'aborted'; usage: { inputTokens: number; outputTokens: number; totalTokens: number }; provider?: string; model?: string }
  | { type: 'error'; error: { code: string; message: string; retryable: boolean } };

/** app 消费的事件名词表（host-hub 还会发 hook/error、request/start、step/*、plugin/*——一律忽略）。 */
export type HubEventName =
  | 'assistant/stream'
  | 'tool/start'
  | 'tool/result'
  | 'tool/progress'
  | 'turn/start'
  | 'turn/end'
  | 'settled'
  | 'inbox/spliced'
  | 'compaction'
  | 'llm/retry'
  | 'permission/decision'
  | 'agents/spawned'
  | 'agents/state'
  | 'agents/terminal'
  | 'agents/evicted'
  | 'agents/user-injected'
  | 'agents/permission-ask'
  | 'agents/idle'
  | 'bash_execution_update';

export const HUB_EVENT_NAMES = [
  'assistant/stream',
  'tool/start',
  'tool/result',
  'tool/progress',
  'turn/start',
  'turn/end',
  'settled',
  'inbox/spliced',
  'compaction',
  'llm/retry',
  'permission/decision',
  'agents/spawned',
  'agents/state',
  'agents/terminal',
  'agents/evicted',
  'agents/user-injected',
  'agents/permission-ask',
  'agents/idle',
  'bash_execution_update',
] as const;

/** agents/* 事件载荷（七事件同构身份字段：agentId/agentName/runId）。 */
export interface AgentsEventPayload {
  agentId: string;
  agentName: string;
  runId?: number;
  /** agents/spawned 专属。 */
  sessionId?: string;
  agentType?: string;
  /** agents/state 专属。 */
  from?: 'busy' | 'idle';
  to?: 'busy' | 'idle';
  /** agents/terminal 专属（中断路径无 usage）。 */
  status?: string;
  usage?: { inputTokens: number; outputTokens: number; totalTokens: number };
  /** agents/evicted 专属。 */
  reason?: 'lru' | 'replaced';
  /** agents/user-injected 专属。 */
  summary?: string;
  /** agents/permission-ask 专属。 */
  askId?: string;
  toolName?: string;
}

// 编译期封闭断言：事件词表与类型联合双向绑定（漂移即编译失败）。
type CoversUnion<T, U extends T> = [T] extends [U] ? unknown : never;
const _hubEventNamesCover = null as unknown as CoversUnion<HubEventName, (typeof HUB_EVENT_NAMES)[number]>;
void _hubEventNamesCover;
