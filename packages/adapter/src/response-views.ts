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
  ThinkingLevelView,
  WorkerRowView,
} from '@paiapp/contracts';

import { previewArgs } from './args-preview';

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
  const modelId = str(model.modelId);
  return {
    model: provider.length > 0 && modelId.length > 0 ? { provider, modelId } : null,
    isStreaming: d.isStreaming === true,
    isCompacting: d.isCompacting === true,
    sessionName: optStr(d.sessionName) ?? null,
    messageCount: num(d.messageCount, 0),
    queue: queueView(d.queue),
  };
}

/** 排队面：垃圾形状回落两个空数组（无队列后端即此形态）。 */
function queueView(value: unknown): { steering: string[]; followUp: string[] } {
  const q = recordOf(value);
  return { steering: stringList(q.steering), followUp: stringList(q.followUp) };
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

/**
 * get_inflight → 渲染层视图。在途消息 content 为 {type, text} 块数组
 * （thinking/text/tool_use_partial）——与流式增量同一套提取语义；
 * 消息身份 messageTs = turnStartedAt（在途消息属当前轮，hub 侧无独立时间戳）。
 */
export function inflightView(data: unknown): InflightView {
  const d = recordOf(data);
  const turnStartedAt = numOrNull(d.turnStartedAt);
  return {
    turnStartSeq: numOrNull(d.turnStartSeq),
    turnStartedAt,
    message: inflightMessageView(d.message, turnStartedAt),
    toolOutputs: Array.isArray(d.toolOutputs)
      ? d.toolOutputs.map(toolOutputView).filter((item): item is NonNullable<typeof item> => item !== null)
      : [],
    bash: bashView(d.bash),
  };
}

function inflightMessageView(value: unknown, turnStartedAt: number | null): InflightMessageView | null {
  if (typeof value !== 'object' || value === null) return null;
  const message = recordOf(value);
  const blocks = Array.isArray(message.content) ? message.content : [];
  const text: string[] = [];
  const thinking: string[] = [];
  const toolCalls: InflightMessageView['toolCalls'] = [];
  for (const block of blocks) {
    const b = recordOf(block);
    const blockText = typeof b['text'] === 'string' ? b['text'] : '';
    if (b['type'] === 'text') text.push(blockText);
    else if (b['type'] === 'thinking') thinking.push(blockText);
    else if (b['type'] === 'tool_use_partial') {
      // text = 参数 JSON 的流式半成品：宽容解析（失败按无参数降级——预览空串）
      let args: Record<string, unknown> = {};
      try {
        const parsed: unknown = JSON.parse(blockText);
        if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) args = parsed as Record<string, unknown>;
      } catch {
        args = {};
      }
      toolCalls.push({ id: str(b['id']), name: str(b['name']), argsPreview: blockText.length > 0 ? previewArgs(args) : '' });
    }
  }
  return { messageTs: turnStartedAt ?? 0, text: text.join('\n'), thinking: thinking.join('\n'), toolCalls };
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

function bashView(value: unknown): { id: string; command: string; startedAt: number } | null {
  if (typeof value !== 'object' || value === null) return null;
  const bash = recordOf(value);
  return {
    id: str(bash.id),
    command: str(bash.command),
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
    const agentId = str(entry.agentId);
    if (agentId.length === 0) continue;
    const status = str(entry.status);
    out.push({
      agentId,
      agentName: str(entry.agentName),
      work: str(entry.work),
      status: status === 'busy' || status === 'idle' || status === 'on-disk' ? status : 'idle',
      runId: num(entry.runId, 0),
      sessionId: str(entry.sessionId),
      ...(str(entry.agentType).length > 0 ? { agentType: str(entry.agentType) } : {}),
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

/**
 * thread/list_saved 响应 → 已存会话视图。summary 无 sessionPath——按布局契约
 * `<sessionsRoot>/<id>/transcript.jsonl` 重建（布局是 host-hub 协议事实）。
 */
export function savedSessions(data: unknown, sessionsRoot: string): SavedSessionView[] {
  const sessions = recordOf(data)['sessions'];
  if (!Array.isArray(sessions)) return [];
  const out: SavedSessionView[] = [];
  for (const item of sessions) {
    const s = recordOf(item);
    const id = str(s.id);
    if (id.length === 0) continue;
    const title = str(s.title);
    out.push({
      sessionPath: `${sessionsRoot}/${id}/transcript.jsonl`,
      sessionId: id,
      cwd: str(s.cwd),
      name: title.length > 0 ? title : null,
      modifiedAt: num(s.updatedAt, 0),
      messageCount: num(s.messageCount, 0),
      firstMessage: title,
    });
  }
  return out;
}

/** get_models 响应（扁平数组）→ 模型视图；reasoning 能力位由主进程渠道配置 join。 */
export function modelInfos(data: unknown): ModelInfoView[] {
  const models = Array.isArray(data) ? data : [];
  const out: ModelInfoView[] = [];
  for (const item of models) {
    const m = recordOf(item);
    const provider = str(m.provider);
    const modelId = str(m.id);
    if (provider.length === 0 || modelId.length === 0) continue;
    const source = m.source === 'preset' || m.source === 'custom' ? m.source : undefined;
    out.push({ provider, modelId, ...(source !== undefined ? { source } : {}) });
  }
  return out;
}

export function sessionStatsView(data: unknown): SessionStatsView {
  const d = recordOf(data);
  const tokens = recordOf(d.tokens);
  return {
    userMessages: num(d.userMessages, 0),
    assistantMessages: num(d.assistantMessages, 0),
    toolCalls: num(d.toolCalls, 0),
    tokens: { input: num(tokens.input, 0), output: num(tokens.output, 0), total: num(tokens.total, 0) },
    cost: num(d.cost, 0),
  };
}

/** get_thinking_level 响应 → 视图（level=unset 表示各级未设置）。 */
export function thinkingLevelView(data: unknown): ThinkingLevelView {
  const d = recordOf(data);
  const source = str(d.source);
  return {
    level: str(d.level),
    source: source === 'session' || source === 'project' || source === 'user' || source === 'unset' ? source : 'unset',
  };
}

/** get_commands 响应（顶层数组）→ 命令视图（缺名/source 词表外丢弃；description 缺省 null）。 */
export function sessionCommands(data: unknown): CommandView[] {
  const commands = Array.isArray(data) ? data : [];
  const out: CommandView[] = [];
  for (const item of commands) {
    const c = recordOf(item);
    const name = str(c.name);
    if (name.length === 0) continue;
    const source = c.source;
    if (source !== 'plugin' && source !== 'skill' && source !== 'builtin') continue;
    out.push({ name, description: optStr(c.description), source });
  }
  return out;
}

/** 技能清单 → 目录条目（get_commands 的 skill 源同型命名 `skill:<name>`）。
 * 无会话时（新建任务页）以用户级启用技能预构目录——plugin/builtin
 * 源依赖会话态（插件注册表/能力门控），预摆即假能力，不构造。 */
export function previewCommands(skills: readonly { name: string }[]): CommandView[] {
  const out: CommandView[] = [];
  for (const skill of skills) {
    if (skill.name.length === 0) continue;
    out.push({ name: `skill:${skill.name}`, description: null, source: 'skill' });
  }
  return out;
}

/** get_host_info 响应 → 宿主信息视图（垃圾输入降级为全零形态，不抛）。 */
export function hostInfoView(data: unknown): HostInfoView {
  const d = recordOf(data);
  const threads = recordOf(d.threads);
  const limits = recordOf(d.limits);
  return {
    version: str(d.version),
    bunVersion: str(d.bunVersion),
    pid: num(d.pid, 0),
    uptimeMs: num(d.uptimeMs, 0),
    rssBytes: num(d.rssBytes, 0),
    threads: { live: num(threads.live, 0), parked: num(threads.parked, 0), dead: num(threads.dead, 0) },
    limits: {
      maxThreads: num(limits.maxThreads, 1),
      idleRetireMs: num(limits.idleRetireMs, 1),
      workerStaleMs: num(limits.workerStaleMs, 1),
      workerExitTimeoutMs: num(limits.workerExitTimeoutMs, 1),
      rssRetireBytes: num(limits.rssRetireBytes, 0),
      bashTimeoutMs: num(limits.bashTimeoutMs, 0),
    },
  };
}

/** thread/list 响应（顶层数组）→ worker 行（缺 threadId 丢弃；观测字段垃圾输入降级零形态）。 */
export function threadListRows(data: unknown): WorkerRowView[] {
  const threads = Array.isArray(data) ? data : [];
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

function numOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function recordOf(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}
