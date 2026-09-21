import type { WalEvent } from './hub-protocol';

/**
 * host-hub 常用响应 data 形状（adapter 收窄的输入镜像；从 hub-protocol 拆出
 * 保持行数预算）。规格真相源 = x-harness 仓库各 handler 实现。
 */

// ============================================================================
// 常用响应 data 形状（adapter 收窄的输入镜像）
// ============================================================================

/** get_entries 响应（seq 0 基 WAL 行号；event = 摊平 {type, …data, surfaceOp?}）。 */
export interface EntriesData {
  entries: Array<{ seq: number; ts: number; event: WalEvent }>;
  leafSeq: number;
  hasMore: boolean;
}

/** get_state 响应（model 复合形——字段名 model 非 modelId）。 */
export interface StateData {
  model: { provider: string; model: string };
  isStreaming: boolean;
  isCompacting: boolean;
  sessionId: string;
  sessionName: string;
  sessionFile: string;
  messageCount: number;
  queue: { steering: string[]; followUp: string[] };
}

/** get_models 目录条目（reasoning 恒在场；input 条件在场——携图能力判据）。 */
export interface ModelCatalogEntry {
  id: string;
  provider: string;
  contextWindow: number;
  maxTokens: number;
  reasoning: boolean;
  input?: Array<'text' | 'image'>;
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

/** thread/list_saved 会话摘要（无 sessionPath；app 按 agentDir/sessions/<id>/events.jsonl 布局重建）。 */
export interface SavedSessionSummary {
  id: string;
  createdAt: number;
  updatedAt: number;
  title: string;
  model?: string;
  cwd?: string;
  forkParent?: string;
  messageCount: number;
  lastSeq: number;
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

/** thread/delete 响应（本次实际删除的目录名集；幂等 = 空集）。 */
export interface DeleteData {
  removed: string[];
}

/** compact / prompt /compact 拦截成功响应（压缩同步长操作，响应即终态）。 */
export interface CompactData {
  summary: string;
  replacedCount: number;
  summaryTokens: number;
}

/** bash 响应。 */
export interface BashResultData {
  output: string;
  exitCode: number;
  cancelled: boolean;
  truncated: boolean;
  fullOutputPath?: string;
}

/** get_inflight 响应（toolOutputs 执行中有实时尾部内容）。 */
export interface InflightData {
  turnStartSeq: number | null;
  turnStartedAt: number | null;
  message: { role: 'assistant'; content: Array<{ type: 'thinking' | 'text' | 'tool_use_partial'; text: string }> } | null;
  toolOutputs: Array<{ callId: string; output: string; truncated: boolean; startedAt: number }>;
  bash: { id: string; command: string; startedAt: number } | null;
}

/** get_subagents 响应（ChildView 判别联合原样；hub 内部署恒 subagent 行）。 */
export interface SubagentsData {
  subagents: Array<
    | {
        kind: 'subagent';
        agentId: string;
        sessionId: string;
        type: string;
        depth: number;
        status: 'running' | 'idle' | 'stopped';
        work?: string;
      }
    | {
        kind: 'local-session';
        name: string;
        ref: string;
        status: 'running' | 'idle';
      }
  >;
}

/** get_session_stats 响应（cost 嵌 tokens 且可缺席）。 */
export interface SessionStatsData {
  userMessages: number;
  assistantMessages: number;
  toolCalls: number;
  toolResults: number;
  tokens: { input: number; output: number; total: number; cost?: number };
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

/** get_commands 条目（source：command = 机器拦截的斜杠动词；skill = 模型分发面）。 */
export interface CommandEntry {
  name: string;
  description?: string;
  source: 'command' | 'skill';
}

/** get_thinking_level 响应（无值态归一 off/source off）。 */
export interface ThinkingLevelData {
  level: 'off' | 'low' | 'medium' | 'high' | 'max';
  source: 'session' | 'project' | 'user' | 'off';
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

/** skills/list 响应（hub wire 形状——source 词表 user|project）。 */
export interface SkillEntry {
  name: string;
  source: 'user' | 'project';
  path: string;
  disabled: boolean;
}
