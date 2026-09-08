import type {
  AgentView,
  CommandView,
  ModelInfoView,
  SavedSessionView,
  SessionStatsView,
  SessionView,
  ThreadStateView,
  ThreadListEntry,
} from '@paiapp/contracts';

/**
 * 协议响应 data → 渲染层视图（收窄与降级：垃圾输入回落空形态，不抛）。
 */

export function threadListEntries(data: unknown): ThreadListEntry[] {
  const threads = recordOf(data)['threads'];
  if (!Array.isArray(threads)) return [];
  const out: ThreadListEntry[] = [];
  for (const item of threads) {
    const t = recordOf(item);
    const threadId = str(t.threadId);
    if (threadId.length === 0) continue;
    out.push({
      threadId,
      cwd: str(t.cwd),
      sessionPath: optStr(t.sessionPath) ?? null,
      isStreaming: t.isStreaming === true,
      state: t.state === 'live' || t.state === 'parked' || t.state === 'dead' ? t.state : 'parked',
    });
  }
  return out;
}

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

/** thread/start、thread/resume 响应 → SessionView（title 由注册表/调用方补）。 */
export function sessionFromStartResponse(data: unknown, fallbackTitle: string): SessionView | null {
  const d = recordOf(data);
  const threadId = str(d.threadId);
  if (threadId.length === 0) return null;
  return toSessionView({
    threadId,
    cwd: str(d.cwd),
    sessionPath: optStr(d.sessionPath) ?? null,
    title: fallbackTitle,
    lastActivityAt: Date.now(),
  });
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
  };
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
    out.push({ provider, modelId });
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
    if (source !== 'extension' && source !== 'prompt' && source !== 'skill') continue;
    out.push({ name, description: optStr(c.description), source });
  }
  return out;
}

/** agents/list 响应 → agent 视图（缺名丢弃；source 词表外丢弃；tools/model 缺失收窄 null）。 */
export function agentViews(data: unknown): AgentView[] {
  const agents = recordOf(data)['agents'];
  if (!Array.isArray(agents)) return [];
  const out: AgentView[] = [];
  for (const item of agents) {
    const a = recordOf(item);
    const name = str(a.name);
    if (name.length === 0) continue;
    const source = a.source;
    if (source !== 'user' && source !== 'project') continue;
    const tools = Array.isArray(a.tools) ? a.tools.filter((tool): tool is string => typeof tool === 'string') : null;
    out.push({ name, description: str(a.description), source, tools, model: optStr(a.model) });
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
