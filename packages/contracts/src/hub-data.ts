import type { WalEvent } from './hub-protocol';

/**
 * host-hub 常用响应 data 形状（adapter 收窄的输入镜像；从 hub-protocol 拆出
 * 保持行数预算）。规格真相源 = host-hub 仓库各 handler 实现。
 */

// ============================================================================
// 常用响应 data 形状（adapter 收窄的输入镜像）
// ============================================================================

/** get_entries 响应。 */
export interface EntriesData {
  entries: Array<{ seq: number; ts: number; event: WalEvent }>;
  leafSeq: number;
  hasMore: boolean;
}

/** get_state 响应（model 回落形态只带 modelId）。 */
export interface StateData {
  model: { provider?: string; modelId?: string } | { modelId: string };
  isStreaming: boolean;
  isCompacting: boolean;
  sessionId: string;
  sessionName: string;
  sessionFile: string;
  messageCount: number;
  queue: { steering: string[]; followUp: string[] };
}

/** get_models 目录条目。 */
export interface ModelCatalogEntry {
  id: string;
  provider: string;
  contextWindow: number;
  maxTokens: number;
  cost?: { input: number; output: number; cacheRead?: number; cacheWrite?: number };
  source: 'preset' | 'custom';
}

/** thread/list 表项（host 投影）。 */
export interface ThreadListEntry {
  threadId: string;
  cwd: string;
  sessionPath: string | null;
  state: 'live' | 'parked' | 'dead';
  idleMs: number;
  rssBytes: number | null;
  keepalive: boolean;
  isStreaming: boolean;
}

/** thread/list_saved 会话摘要（无 sessionPath；app 按 agentDir/sessions/<id>/transcript.jsonl 布局重建）。 */
export interface SavedSessionSummary {
  id: string;
  createdAt: number;
  updatedAt: number;
  title: string;
  model?: string;
  cwd?: string;
  forkParent?: string;
  forkSeq?: number;
  depth: number;
  messageCount: number;
  lastSeq: number;
  archived: boolean;
}

/** thread/start|resume|register 响应。 */
export interface ThreadOpenData {
  threadId: string;
  cwd: string;
  sessionPath: string;
  projectSettingsPresent?: true;
}

/** fork/clone 响应。 */
export interface ForkData {
  threadId: string;
  previousThreadId: string;
  sessionPath: string;
}

/** bash 响应。 */
export interface BashResultData {
  output: string;
  exitCode: number;
  cancelled: boolean;
  truncated: boolean;
  fullOutputPath?: string;
}

/** get_inflight 响应。 */
export interface InflightData {
  turnStartSeq: number | null;
  turnStartedAt: number | null;
  message: { role: 'assistant'; content: Array<{ type: 'thinking' | 'text' | 'tool_use_partial'; text: string }> } | null;
  toolOutputs: Array<{ callId: string; output: string; truncated: boolean; startedAt: number }>;
  bash: { id: string; command: string; startedAt: number } | null;
}

/** get_subagents 响应。 */
export interface SubagentsData {
  subagents: Array<{
    agentId: string;
    agentName: string;
    work: string;
    status: 'busy' | 'idle' | 'on-disk';
    runId: number;
    sessionId: string;
    createdAt: number;
    lastActiveAt: number;
    agentType?: string;
  }>;
}

/** get_session_stats 响应。 */
export interface SessionStatsData {
  userMessages: number;
  assistantMessages: number;
  toolCalls: number;
  toolResults: number;
  tokens: { input: number; output: number; total: number };
  cost: number;
}

/** get_host_info 响应。 */
export interface HostInfoData {
  version: string;
  bunVersion: string;
  pid: number;
  uptimeMs: number;
  rssBytes: number;
  threads: { live: number; parked: number; dead: number };
  limits: {
    maxThreads: number;
    idleRetireMs: number;
    workerStaleMs: number;
    workerExitTimeoutMs: number;
    rssRetireBytes: number;
    bashTimeoutMs: number;
  };
}

/** get_commands 条目。 */
export interface CommandEntry {
  name: string;
  description?: string;
  source: 'plugin' | 'builtin' | 'skill';
}

/** get_thinking_level 响应。 */
export interface ThinkingLevelData {
  level: 'off' | 'low' | 'medium' | 'high' | 'unset';
  source: 'session' | 'project' | 'user' | 'unset';
}

/** permission/get_mode 响应。 */
export interface PermissionModeData {
  /** 宽松 string：hub 可能回词表外值（手写项目配置）——收窄归消费方 */
  mode: string;
  source: 'session' | 'project' | 'user' | 'default';
}

/** settings/get 响应（带 cwd = 项目级展开）。 */
export interface SettingsData {
  values: Record<string, unknown>;
  sources?: Record<string, 'project' | 'user' | 'union'>;
  raw?: { project: Record<string, unknown>; user: Record<string, unknown> };
}

/** agents/list 响应。 */
export interface AgentTypeEntry {
  name: string;
  description: string;
  source: 'builtin' | 'project' | 'user';
  model?: string;
}

/** skills/list 响应。 */
export interface SkillEntry {
  name: string;
  source: 'skill-builtin' | 'skill-project' | 'skill-user';
  path: string;
  disabled: boolean;
}

