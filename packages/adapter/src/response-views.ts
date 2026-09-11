import type {
  CommandView,
  HostInfoView,
  InflightMessageView,
  InflightView,
  ModelInfoView,
  PendingDialogView,
  SavedSessionView,
  SessionStatsView,
  SessionView,
  SubagentSnapshotView,
  ThreadStateView,
  WorkerRowView,
} from '@paiapp/contracts';

import { assistantText, assistantThinking, assistantToolCalls } from './content';
import { previewArgs } from './args-preview';
import { subagentsField } from './subagent-spawns';

/**
 * 协议响应 data → 渲染层视图（收窄与降级：垃圾输入回落空形态，不抛）。
 */

export interface SessionViewInput {
  threadId: string;
  cwd: string;
  sessionPath: string | null;
  state?: 'live' | 'parked' | 'dead';
  streaming?: boolean;
  title?: string;
  model?: string | null;
  thinkingLevel?: string | null;
  lastActivityAt?: number;
}

export function toSessionView(input: SessionViewInput): SessionView {
  return {
    threadId: input.threadId,
    cwd: input.cwd,
    sessionPath: input.sessionPath,
    title: input.title ?? 'New conversation',
    state: input.state ?? 'live',
    streaming: input.streaming ?? false,
    model: input.model ?? null,
    thinkingLevel: input.thinkingLevel ?? null,
    lastActivityAt: input.lastActivityAt ?? 0,
  };
}

export function threadStateView(data: unknown): ThreadStateView {
  const d = recordOf(data);
  const model = recordOf(d.model);
  const provider = str(model.provider);
  const modelId = str(model.id);
  return {
    model: provider.length > 0 && modelId.length > 0 ? { provider, modelId } : null,
    thinkingLevel: optStr(d.thinkingLevel) ?? null,
    isStreaming: d.isStreaming === true,
    isCompacting: d.isCompacting === true,
    sessionName: optStr(d.sessionName) ?? null,
    messageCount: num(d.messageCount, 0),
    queue: queueView(d.queue),
  };
}

/** 排队面（v0.14）：垃圾形状回落两个空数组（无队列后端即此形态）。 */
function queueView(value: unknown): { steering: string[]; followUp: string[] } {
  const q = recordOf(value);
  return { steering: stringList(q.steering), followUp: stringList(q.followUp) };
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

/**
 * get_inflight → 渲染层视图（v0.14 收敛读口）。在途消息用与转写条目同一套
 * content 提取器正规化（同一消息、同一块身份 messageTs）；垃圾输入回落空形态。
 */
export function inflightView(data: unknown): InflightView {
  const d = recordOf(data);
  return {
    turnStartEntryId: optStr(d.turnStartEntryId) ?? null,
    turnStartedAt: typeof d.turnStartedAt === 'number' && Number.isFinite(d.turnStartedAt) ? d.turnStartedAt : null,
    message: inflightMessageView(d.message),
    toolOutputs: Array.isArray(d.toolOutputs)
      ? d.toolOutputs.map(toolOutputView).filter((item): item is NonNullable<typeof item> => item !== null)
      : [],
    bash: bashView(d.bash),
  };
}

function inflightMessageView(value: unknown): InflightMessageView | null {
  if (typeof value !== 'object' || value === null) return null;
  const message = recordOf(value);
  const messageTs = num(message.timestamp, 0);
  if (messageTs <= 0) return null;
  const toolCalls = assistantToolCalls(message.content).map((call) => ({
    id: call.id,
    name: call.name,
    argsPreview: previewArgs(call.args),
    ...subagentsField(call.name, call.args),
  }));
  return { messageTs, text: assistantText(message.content), thinking: assistantThinking(message.content), toolCalls };
}

function toolOutputView(value: unknown): { callId: string; output: string; truncated: boolean; startedAt: number } | null {
  const entry = recordOf(value);
  const callId = str(entry.callId);
  if (callId.length === 0) return null;
  return {
    callId,
    output: str(entry.output),
    truncated: entry.truncated === true,
    startedAt: num(entry.startedAt, 0),
  };
}

function bashView(value: unknown): { command: string; output: string; truncated: boolean; startedAt: number } | null {
  if (typeof value !== 'object' || value === null) return null;
  const bash = recordOf(value);
  return {
    command: str(bash.command),
    output: str(bash.output),
    truncated: bash.truncated === true,
    startedAt: num(bash.startedAt, 0),
  };
}

/** get_subagents → 视图（垃圾条目丢弃；空列表即空形态）。 */
export function subagentSnapshotView(data: unknown): SubagentSnapshotView[] {
  const list = recordOf(data)['subagents'];
  if (!Array.isArray(list)) return [];
  const out: SubagentSnapshotView[] = [];
  for (const item of list) {
    const entry = recordOf(item);
    const subagentId = str(entry.subagentId);
    if (subagentId.length === 0) continue;
    const status = str(entry.status);
    out.push({
      subagentId,
      agent: str(entry.agent),
      task: str(entry.task),
      status: status === 'queued' || status === 'running' || status === 'completed' || status === 'failed' || status === 'stopped' ? status : 'running',
      elapsedMs: num(entry.elapsedMs, 0),
      output: str(entry.output),
      truncated: entry.truncated === true,
    });
  }
  return out;
}

/** get_pending_dialogs → 视图（与 ui_request 帧同字段，弹窗正规化可复用）。 */
export function pendingDialogsView(data: unknown): PendingDialogView[] {
  const list = recordOf(data)['dialogs'];
  if (!Array.isArray(list)) return [];
  const out: PendingDialogView[] = [];
  for (const item of list) {
    const entry = recordOf(item);
    const requestId = str(entry.requestId);
    const method = str(entry.method);
    if (requestId.length === 0 || method.length === 0) continue;
    out.push({
      requestId,
      threadId: str(entry.threadId),
      method,
      payload: recordOf(entry.payload),
    });
  }
  return out;
}

export function savedSessions(data: unknown): SavedSessionView[] {
  const sessions = recordOf(data)['sessions'];
  if (!Array.isArray(sessions)) return [];
  const out: SavedSessionView[] = [];
  for (const item of sessions) {
    const s = recordOf(item);
    const path = str(s.path);
    if (path.length === 0) continue;
    out.push({
      sessionPath: path,
      sessionId: str(s.id),
      cwd: str(s.cwd),
      name: optStr(s.name) ?? null,
      modifiedAt: dateMs(s.modified),
      messageCount: num(s.messageCount, 0),
      firstMessage: str(s.firstMessage),
    });
  }
  return out;
}

export function modelInfos(data: unknown): ModelInfoView[] {
  const models = recordOf(data)['models'];
  if (!Array.isArray(models)) return [];
  const out: ModelInfoView[] = [];
  for (const item of models) {
    const m = recordOf(item);
    const provider = str(m.provider);
    const modelId = str(m.id);
    if (provider.length === 0 || modelId.length === 0) continue;
    // 思考能力面（新任务页按模型算档位）：非布尔/非映射形状直接丢弃，按不支持降级；
    // 解析出的空 map 不落字段（空 map 与缺省对档位计算同义）
    const map = m.thinkingLevelMap !== undefined ? thinkingLevelMapOf(m.thinkingLevelMap) : undefined;
    out.push({
      provider,
      modelId,
      ...(m.reasoning === true ? { reasoning: true } : {}),
      ...(map !== undefined && Object.keys(map).length > 0 ? { thinkingLevelMap: map } : {}),
    });
  }
  return out;
}

/** thinkingLevelMap 宽容解析：键保留字符串档位，值只认 string | null，其余丢弃。 */
function thinkingLevelMapOf(data: unknown): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  for (const [level, mapped] of Object.entries(recordOf(data))) {
    if (typeof mapped === 'string') out[level] = mapped;
    else if (mapped === null) out[level] = null;
  }
  return out;
}

export function sessionStatsView(data: unknown): SessionStatsView {
  const d = recordOf(data);
  const tokens = recordOf(d.tokens);
  const usage = recordOf(d.contextUsage);
  const percent = usage['percent'];
  return {
    userMessages: num(d.userMessages, 0),
    assistantMessages: num(d.assistantMessages, 0),
    toolCalls: num(d.toolCalls, 0),
    tokensTotal: num(tokens.total, 0),
    cost: num(d.cost, 0),
    // hub 侧 percent 是 0-100 刻度（getContextUsage：tokens/contextWindow*100）；
    // 视图契约是 0-1 比率，此处归一（消费端 ×100 显示、进度环直取比率）
    contextUsage: typeof percent === 'number' && percent >= 0 ? percent / 100 : null,
  };
}

/** get_commands 响应 → 命令视图（缺名/非对象/source 词表外丢弃；description 缺失收窄 null）。 */
export function thinkingLevels(data: unknown): { allowed: string[] } {
  const d = recordOf(data);
  return {
    allowed: Array.isArray(d.levels) ? d.levels.filter((item): item is string => typeof item === 'string') : [],
  };
}

export function sessionCommands(data: unknown): CommandView[] {
  const commands = recordOf(data)['commands'];
  if (!Array.isArray(commands)) return [];
  const out: CommandView[] = [];
  for (const item of commands) {
    const c = recordOf(item);
    const name = str(c.name);
    if (name.length === 0) continue;
    const source = c.source;
    if (source !== 'extension' && source !== 'prompt' && source !== 'skill' && source !== 'builtin') continue;
    out.push({ name, description: optStr(c.description), source });
  }
  return out;
}

/** 技能清单 → 目录条目（get_commands 的 skill 源同型命名 `skill:<name>`）。
 * 无会话时（新建任务页）以用户级启用技能预构目录——extension/prompt/builtin
 * 源依赖会话态（扩展代码加载/模板目录/能力门控），预摆即假能力，不构造。 */
export function previewCommands(skills: readonly { name: string; description: string | null }[]): CommandView[] {
  const out: CommandView[] = [];
  for (const skill of skills) {
    if (skill.name.length === 0) continue;
    out.push({ name: `skill:${skill.name}`, description: skill.description, source: 'skill' });
  }
  return out;
}

/** get_host_info 响应 → 宿主信息视图（垃圾输入降级为全零形态，不抛）。 */
export function hostInfoView(data: unknown): HostInfoView {
  const d = recordOf(data);
  const threads = recordOf(d.threads);
  const subagents = recordOf(d.subagents);
  const limits = recordOf(d.limits);
  const backend = recordOf(d.backend);
  const capabilities = Array.isArray(backend.capabilities) ? backend.capabilities.filter((item): item is string => typeof item === 'string') : [];
  return {
    version: str(d.version),
    piVersion: str(d.piVersion),
    bunVersion: str(d.bunVersion),
    pid: num(d.pid, 0),
    uptimeMs: num(d.uptimeMs, 0),
    rssBytes: num(d.rssBytes, 0),
    threads: { live: num(threads.live, 0), parked: num(threads.parked, 0), dead: num(threads.dead, 0) },
    subagents: { running: num(subagents.running, 0) },
    limits: {
      maxThreads: num(limits.maxThreads, 1),
      idleRetireMs: num(limits.idleRetireMs, 1),
      workerStaleMs: num(limits.workerStaleMs, 1),
      workerExitTimeoutMs: num(limits.workerExitTimeoutMs, 1),
      maxSubagents: num(limits.maxSubagents, 1),
      bashTimeoutMs: num(limits.bashTimeoutMs, 0),
    },
    backend: { id: str(backend.id), version: str(backend.version), capabilities },
  };
}

/** thread/list 响应 → worker 行（缺 threadId 丢弃；观测字段垃圾输入降级零形态）。 */
export function threadListRows(data: unknown): WorkerRowView[] {
  const threads = recordOf(data)['threads'];
  if (!Array.isArray(threads)) return [];
  const out: WorkerRowView[] = [];
  for (const item of threads) {
    const t = recordOf(item);
    const threadId = str(t.threadId);
    if (threadId.length === 0) continue;
    const state = t.state;
    if (state !== 'live' && state !== 'parked' && state !== 'dead') continue;
    out.push({
      threadId,
      cwd: str(t.cwd),
      sessionPath: typeof t.sessionPath === 'string' ? t.sessionPath : null,
      state,
      isStreaming: t.isStreaming === true,
      idleMs: num(t.idleMs, 0),
      subagents: num(t.subagents, 0),
      rssBytes: typeof t.rssBytes === 'number' && Number.isFinite(t.rssBytes) ? t.rssBytes : null,
      keepalive: t.keepalive === true,
    });
  }
  return out;
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function optStr(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function num(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function dateMs(value: unknown): number {
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'string' || typeof value === 'number') {
    const ms = typeof value === 'number' ? value : Date.parse(value);
    return Number.isFinite(ms) ? ms : 0;
  }
  return 0;
}

function recordOf(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}
