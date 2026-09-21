/**
 * UI 端到端假 hub（scripts/ui-e2e 专用，非业务代码）：
 * 以真实 hub 线协议（stdin 单行 JSON 命令 / stdout NDJSON 帧）驱动真 App 的
 * 主进程与渲染层——脚本化「流式（思考+正文+工具）→ 排队 → 结算 → 队列消费」
 * 全场景，无真实 LLM 成本、时序确定。
 *
 * 环境约定：HUB_AGENT_DIR（主进程注入）下 sessions/<id>/events.jsonl 为会话文件。
 */
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { join } from 'node:path';

type WallRow = { seq: number; ts: number; event: Record<string, unknown> };

interface ThreadState {
  threadId: string;
  cwd: string;
  sessionPath: string | null;
  streaming: boolean;
  queue: string[];
  transcript: WallRow[];
  turn: number;
}

const threads = new Map<string, ThreadState>();

/** 懒建线程（app 侧经注册表收养的 id 与 register 新建 id 可能不同源——任何命令
 * 触达的 threadId 都视作在线线程，按需建态）。 */
const threadOf = (threadId: string): ThreadState => {
  const existing = threads.get(threadId);
  if (existing !== undefined) return existing;
  const created: ThreadState = { threadId, cwd: '/tmp/ui-e2e-ws', sessionPath: null, streaming: false, queue: [], transcript: [], turn: 1 };
  threads.set(threadId, created);
  return created;
};
const out = (frame: Record<string, unknown>): void => {
  process.stdout.write(`${JSON.stringify(frame)}\n`);
};
const respond = (id: unknown, data: unknown): void => {
  if (typeof id !== 'number' && typeof id !== 'string') return;
  out({ type: 'response', id, success: true, data });
};
/** 命令字段安全取串：非串值（垃圾输入）回退缺省，不做对象字符串化。 */
const strOf = (value: unknown, fallback = ''): string => (typeof value === 'string' ? value : fallback);

let walSeq = 0;
const wal = (thread: ThreadState, event: Record<string, unknown>): WallRow => {
  const row = { seq: (walSeq += 1), ts: Date.now(), event };
  thread.transcript.push(row);
  return row;
};

const sessionRow = (thread: ThreadState) => ({
  threadId: thread.threadId,
  cwd: thread.cwd,
  sessionPath: thread.sessionPath,
  title: `E2E 会话 ${thread.threadId}`,
  state: 'live',
  streaming: thread.streaming,
  model: 'fake/fake-1',
  thinkingLevel: null,
  lastActivityAt: Date.now(),
});

/** 场景节拍（ms）：事件推进间隔——足够慢可截屏、足够快不拖沓。 */
const BEAT = 260;

const emit = (thread: ThreadState, name: string, payload: Record<string, unknown>): void => {
  out({ type: 'event', threadId: thread.threadId, name, payload });
};

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

/** 一轮完整对话：思考流 → 正文流 → 工具（调起/增量/结果）→ 权威消息 → 结算。 */
async function runTurn(thread: ThreadState, echoText: string): Promise<void> {
  thread.streaming = true;
  const turn = thread.turn;
  const step = 0;
  emit(thread, 'turn/start', { time: Date.now(), turn, step });
  await sleep(BEAT);

  for (const piece of ['用户问的是', '队列与消息渲染，', '我先检查渲染管线']) {
    emit(thread, 'llm/chunk', { turn, step, chunk: { type: 'thinking-delta', text: piece } });
    await sleep(BEAT);
  }
  for (const piece of ['收到「', echoText.slice(0, 6), '」，开始分析。']) {
    emit(thread, 'llm/chunk', { turn, step, chunk: { type: 'text-delta', text: piece } });
    await sleep(BEAT);
  }

  const callId = `call-${turn}`;
  emit(thread, 'tool/call', { turn, step, callId, name: 'bash', arguments: { command: 'ls -la' } });
  await sleep(BEAT);
  for (const piece of ['total 8\ndrwxr-xr-x', '  src  out  package.json\n', 'done']) {
    emit(thread, 'agent/tool-stream', { turn, step, callId, delta: piece });
    await sleep(BEAT);
  }
  emit(thread, 'tool/result', { turn, step, callId, name: 'bash', content: 'total 8\nsrc  out  package.json\ndone', isError: false });
  await sleep(BEAT);

  // 弹窗剧本：消息含「请求确认」→ 工具后推 ui_request（confirm），弹窗停留待答
  // （轮照常结算——隔离验收只关心呈现归属，不关心 hub 侧挂起语义）
  if (echoText.includes('请求确认')) {
    out({
      type: 'ui_request',
      requestId: `req-${turn}`,
      threadId: thread.threadId,
      method: 'confirm',
      tool: 'Bash',
      summary: 'rm -rf /tmp/ui-e2e-probe',
    });
    await sleep(BEAT);
  }

  const finalText = `收到「${echoText}」，工具输出已核对：目录含 src/out/package.json。本轮结论 ${turn} 号。`;
  const finalThinking = '用户问的是队列与消息渲染，我先检查渲染管线';
  // tool_use 块字段与真内核对齐：callId/name/input（input 为 JSON 字符串）
  const finalBlocks = [
    { type: 'text', text: finalText },
    { type: 'tool_use', callId, name: 'bash', input: JSON.stringify({ command: 'ls -la' }) },
  ];
  emit(thread, 'assistant/message', { turn, step, content: finalBlocks, thinking: finalThinking });
  // WAL 按真内核事件序：user 回显（turn 前已写）→ assistant 条目（tool_use 同载）
  // → tool/result 并入其前一条 assistant 条目（entries-mapper 分组语义）
  wal(thread, { type: 'assistant/message', content: finalBlocks, thinking: finalThinking });
  wal(thread, { type: 'tool/result', callId, name: 'bash', content: 'total 8\nsrc  out  package.json\ndone', isError: false });
  await sleep(BEAT);

  emit(thread, 'settled', { ok: true });
  thread.streaming = false;
  thread.turn += 1;

  // 队列消费：轮末自动取下一条（hub 原子语义）；inbox 变更同样发信号（队列面清位）
  const next = thread.queue.shift();
  if (next !== undefined) {
    await sleep(3 * BEAT);
    emit(thread, 'agent/inbox/spliced', { op: 'splice', ids: [] });
    wal(thread, { type: 'user/message', content: [{ type: 'text', text: next }] });
    void runTurn(thread, next);
  }
}

const startPrompt = (thread: ThreadState, message: string): void => {
  wal(thread, { type: 'user/message', content: [{ type: 'text', text: message }] });
  void runTurn(thread, message);
};

// ── 命令分派 ───────────────────────────────────────────────────────────────
const HISTORY_SESSION = { id: 's1', cwd: '/tmp/ui-e2e-ws', title: 'E2E 会话 s1', updatedAt: Date.now(), messageCount: 0 };

function handle(command: Record<string, unknown>): void {
  const { id, type } = command;
  switch (type) {
    case 'get_host_info':
      respond(id, {
        version: '0.0.0-fake', bunVersion: '1.4.2', pid: process.pid, uptimeMs: 1000, rssBytes: 64 * 1024 * 1024,
        threads: { live: threads.size, parked: 0, dead: 0 },
        limits: { maxThreads: 32, idleRetireMs: 300000, workerStaleMs: 30000, workerExitTimeoutMs: 10000, rssRetireBytes: 0, bashTimeoutMs: 600000 },
      });
      return;
    case 'get_models':
      respond(id, [{ id: 'fake-1', provider: 'fake', source: 'preset' }]);
      return;
    case 'settings/get':
      respond(id, { values: {} });
      return;
    case 'skills/list':
      respond(id, { skills: [] });
      return;
    case 'thread/list':
      respond(id, [...threads.values()].map(sessionRow));
      return;
    case 'thread/list_saved':
      respond(id, { sessions: [HISTORY_SESSION] });
      return;
    case 'thread/start': {
      const threadId = `t${threads.size + 1}`;
      const thread: ThreadState = {
        threadId,
        cwd: strOf(command['cwd'], '/tmp/ui-e2e-ws'),
        sessionPath: null,
        streaming: false,
        queue: [],
        transcript: [],
        turn: 1,
      };
      threads.set(threadId, thread);
      respond(id, sessionRow(thread));
      return;
    }
    case 'thread/register': {
      const sessionPath = typeof command['sessionPath'] === 'string' ? command['sessionPath'] : null;
      const threadId = `t${threads.size + 1}`;
      const thread: ThreadState = {
        threadId,
        cwd: strOf(command['cwd'], '/tmp/ui-e2e-ws'),
        sessionPath,
        streaming: false,
        queue: [],
        transcript: [],
        turn: 1,
      };
      threads.set(threadId, thread);
      respond(id, sessionRow(thread));
      return;
    }
    case 'thread/resume': {
      // resume 响应 = SessionView（收养链据此建行；id 从 threadId 或 sessionPath 主干回推）
      const explicit = typeof command['threadId'] === 'string' ? command['threadId'] : null;
      const fromPath = typeof command['sessionPath'] === 'string' ? command['sessionPath'].split('/').at(-2) ?? '' : '';
      const threadId = explicit !== null && explicit.length > 0 ? explicit : fromPath;
      respond(id, sessionRow(threadOf(threadId.length > 0 ? threadId : `t${threads.size + 1}`)));
      return;
    }
    case 'thread/set_keepalive':
    case 'thread/retire':
    case 'thread/stop':
    case 'thread/delete':
    case 'set_model':
    case 'set_thinking_level':
    case 'get_thinking_level':
    case 'set_session_name':
    case 'set_idle_retire_ms':
    case 'clear_queue':
    case 'subagent/steer':
    case 'ui_response':
    case 'compact':
      respond(id, {});
      return;
    case 'prompt': {
      const threadId = strOf(command['threadId']);
      const message = strOf(command['message']);
      const thread = threadOf(threadId);
      if (thread.sessionPath === null && thread.transcript.length === 0) {
        // 首条消息落盘会话文件（路径与真实布局同构）
        thread.sessionPath = join(String(process.env['HUB_AGENT_DIR'] ?? '.'), 'sessions', thread.threadId, 'events.jsonl');
        mkdirSync(join(String(process.env['HUB_AGENT_DIR'] ?? '.'), 'sessions', thread.threadId), { recursive: true });
        writeFileSync(thread.sessionPath, '');
      }
      if (thread.streaming) {
        // hub 原子排队：流式中 followUp 入队，轮末自动消费；inbox 变更发
        // agent/inbox/spliced 信号（主进程据此拉 get_state 合成 queueChanged）
        thread.queue.push(message);
        emit(thread, 'agent/inbox/spliced', { op: 'push', ids: [String(Date.now())] });
        respond(id, { queued: true });
        return;
      }
      respond(id, {});
      startPrompt(thread, message);
      return;
    }
    case 'abort':
      respond(id, {});
      return;
    case 'get_entries': {
      const thread = threadOf(strOf(command['threadId']));
      respond(id, { entries: thread.transcript.map((row) => ({ ...row })) });
      return;
    }
    case 'get_state': {
      const thread = threadOf(strOf(command['threadId']));
      respond(id, {
        isStreaming: thread.streaming,
        queue: { steering: [], followUp: [...thread.queue] },
        messageCount: thread.transcript.length,
        sessionName: null,
        model: 'fake/fake-1',
        isCompacting: false,
      });
      return;
    }
    case 'get_inflight': {
      const thread = threadOf(strOf(command['threadId']));
      if (!thread.streaming) {
        respond(id, { turnStartSeq: null, turnStartedAt: null, message: null, toolOutputs: [], bash: null });
        return;
      }
      respond(id, {
        turnStartSeq: thread.transcript.at(-1)?.seq ?? null,
        turnStartedAt: Date.now() - 2000,
        message: { messageTs: Date.now(), text: '', thinking: '', toolCalls: [] },
        toolOutputs: [],
        bash: null,
      });
      return;
    }
    case 'get_subagents':
      respond(id, { subagents: [] });
      return;
    case 'get_pending_dialogs':
      respond(id, { dialogs: [] });
      return;
    case 'get_session_stats':
      respond(id, { userMessages: 1, assistantMessages: 1, toolCalls: 1, toolResults: 1, tokens: { input: 10, output: 20, total: 30, cost: 0 } });
      return;
    case 'get_commands':
      respond(id, []);
      return;
    default:
      respond(id, {});
  }
}

// 心跳（首个心跳把主进程相位置 ready）
setInterval(() => {
  out({ type: 'heartbeat', at: Date.now(), rssBytes: 64 * 1024 * 1024, cpuPercent: 1.2 });
}, 500);

let buffer = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk: string) => {
  buffer += chunk;
  for (;;) {
    const index = buffer.indexOf('\n');
    if (index === -1) break;
    const line = buffer.slice(0, index);
    buffer = buffer.slice(index + 1);
    if (line.trim().length === 0) continue;
    try {
      const command = JSON.parse(line) as Record<string, unknown>;
      appendFileSync(resolve(import.meta.dir, 'hub-trace.log'), `${JSON.stringify({ t: Date.now(), type: command['type'], id: command['id'], threadId: command['threadId'], message: command['message'] })}\n`);
      handle(command);
    } catch {
      // 坏命令行忽略（主进程编码恒合法，此处防御）
    }
  }
});
process.stdin.on('end', () => {
  process.exit(0);
});
