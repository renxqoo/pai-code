import type { UiEvent } from '@paiapp/contracts';
import type { SubagentModel, ThreadItem, ToolCallModel, TurnBlock, TurnModel } from '@/thread/thread-model';

import { hydrateItems, hydrateNewItems, mergeDiffFile } from './hydrate-items';
import { initialThreadState, type HydrateAction, type LiveThreadState } from './live-thread-state';

/**
 * 事件折叠状态机（纯函数）：UiEvent + 对账动作 → 视图状态。
 * 语义锚点：
 * - 流式只拼 delta；messageFinal 权威替换；turnSettled 恰好一次终态（agent_end 多次不驱动终态）；
 * - 用户停止意图（stopping）让 settle 后的轮次呈现 stopped；
 * - 条目（真相）与 live 轮次（装饰）共存：settle 后对账以 dropLiveTurn 替换。
 */

const MAX_LIVE_CHARS = 4 * 1024 * 1024;
const LIVE_TURN_PREFIX = 'live-turn-';

export function foldThreadEvent(state: LiveThreadState, event: UiEvent, now: number): LiveThreadState {
  switch (event.type) {
    case 'turnStarted':
      return onTurnStarted(state, event.at);
    case 'userMessage': {
      if (state.seenIds.has(event.message.id)) return state;
      const message: ThreadItem = {
        kind: 'message',
        message: {
          id: `msg-${event.message.id}`,
          role: event.message.origin === 'system' ? 'system' : 'user',
          text: event.message.text.slice(0, MAX_LIVE_CHARS),
        },
      };
      return {
        ...state,
        seenIds: new Set([...state.seenIds, event.message.id]),
        items: insertBeforeLiveTurn(state.items, message, state.liveTurnId),
      };
    }
    case 'messageStarted':
      // 重试成功后模型继续出消息：清除重试提示
      return ensureLiveTurn({ ...state, liveMessageId: event.messageId, retrying: null }, now);
    case 'textDelta':
      return appendDelta(state, resolveMessageId(state, event.messageId), 'text', event.delta, now);
    case 'thinkingDelta':
      return appendDelta(state, resolveMessageId(state, event.messageId), 'thinking', event.delta, now);
    case 'toolCallAdded': {
      const withTurn = ensureLiveTurn(state, now);
      const turn = findTurn(withTurn, withTurn.liveTurnId);
      if (turn === null) return withTurn;
      const call: ToolCallModel = {
        id: event.call.id,
        name: event.call.name,
        argsPreview: event.call.argsPreview,
        output: '',
        exitCode: null,
        durationMs: null,
        status: 'running',
      };
      const withStart = { ...withTurn, callStarts: { ...withTurn.callStarts, [event.call.id]: now } };
      return updateTurn(withStart, turn.id, (current) => ({
        ...current,
        blocks: appendToolCall(current.blocks, call, current.id),
      }));
    }
    case 'toolUpdated':
      return mapLiveCall(state, event.callId, (call) => ({ ...call, output: clip(call.output + event.output) }));
    case 'toolEnded':
      return onToolEnded(state, event.callId, event.output, event.isError, event.diff, now);
    case 'messageFinal':
      return onMessageFinal(state, event);
    case 'turnSettled': {
      if (state.liveTurnId === null) return { ...state, streaming: false, retrying: null, stopping: false };
      const stopped = state.stopping;
      return {
        ...state,
        streaming: false,
        stopping: false,
        retrying: null,
        liveMessageId: null,
        items: state.items.map((item) =>
          item.kind === 'turn' && item.turn.id === state.liveTurnId && item.turn.status === 'running'
            ? { kind: 'turn', turn: { ...item.turn, status: stopped ? 'stopped' : 'completed', endedAt: now } }
            : item,
        ),
      };
    }
    case 'queueChanged':
      return { ...state, queue: { steering: [...event.steering], followUp: [...event.followUp] } };
    case 'compacting':
      return { ...state, compacting: event.active };
    case 'retrying':
      return {
        ...state,
        retrying: { attempt: event.attempt, maxAttempts: event.maxAttempts, errorMessage: event.errorMessage },
      };
    case 'subagentStarted':
      return upsertAgent(state, event.subagentId, now, (agent) => ({
        ...agent,
        name: event.agent,
        agentType: event.agent,
        startedAt: now,
      }));
    case 'subagentDelta':
      return upsertAgent(state, event.subagentId, now, (agent) => ({ ...agent, summary: clip(agent.summary + event.delta) }));
    case 'subagentText':
      return upsertAgent(state, event.subagentId, now, (agent) => ({ ...agent, summary: clip(event.text) }));
    case 'subagentTool':
      return onSubagentTool(state, event, now);
    case 'subagentSettled':
      return upsertAgent(state, event.subagentId, now, (agent) => ({ ...agent, status: 'done', endedAt: now }));
    case 'subagentMessage':
      return upsertAgent(state, event.subagentId, now, (agent) => ({
        ...agent,
        summary: agent.summary.length > 0 ? `${agent.summary}\n${event.text}` : event.text,
      }));
    case 'sessionDied':
      return { ...state, crashed: true };
    case 'dialogRequest':
    case 'dialogSettled':
    case 'host':
    case 'sessionUpdated':
    case 'sessionRemoved':
    case 'sessionRenamed':
    case 'bashOutput':
      // 会话表/对话框/直执行面在 store 层处理；bash 无 v1 UI 入口
      return state;
    default:
      return state;
  }
}

export function foldHydrate(state: LiveThreadState, action: HydrateAction): LiveThreadState {
  switch (action.kind) {
    case 'hydrate/initial': {
      const items = hydrateItems(action.items);
      return { ...initialThreadState, items, cursor: action.cursor, seenIds: new Set(action.items.map((item) => item.id)) };
    }
    case 'hydrate/reconcile': {
      const fresh = hydrateNewItems(action.items).filter(({ entryIds }) => entryIds.some((id) => !state.seenIds.has(id)));
      const liveTurn = action.dropLiveTurn ? null : state.liveTurnId;
      let items = state.items;
      const wasStopped =
        action.dropLiveTurn && state.liveTurnId !== null
          ? items.some((item) => item.kind === 'turn' && item.turn.id === state.liveTurnId && item.turn.status === 'stopped')
          : false;
      for (const { item } of fresh) {
        items = insertBeforeLiveTurn(items, item, liveTurn);
      }
      if (action.dropLiveTurn && state.liveTurnId !== null) {
        items = items.filter((item) => !(item.kind === 'turn' && item.turn.id === state.liveTurnId));
      }
      // 权威替换继承用户停止语义：settle 前被停止的轮次保持 stopped 终态
      if (wasStopped) {
        for (let index = items.length - 1; index >= 0; index -= 1) {
          const item = items[index];
          if (item?.kind === 'turn') {
            items = [...items.slice(0, index), { kind: 'turn', turn: { ...item.turn, status: 'stopped' } }, ...items.slice(index + 1)];
            break;
          }
        }
      }
      const seen = new Set([...state.seenIds, ...action.items.map((item) => item.id)]);
      return { ...state, items, cursor: action.cursor ?? state.cursor, seenIds: seen, liveTurnId: liveTurn };
    }
    case 'hydrate/rebuild': {
      const items = [...hydrateItems(action.items)];
      // 继承用户停止语义：live 轮在 settle 前被停止时，末轮标 stopped
      const wasStopped =
        state.liveTurnId !== null && state.items.some((item) => item.kind === 'turn' && item.turn.id === state.liveTurnId && item.turn.status === 'stopped');
      if (wasStopped) {
        for (let index = items.length - 1; index >= 0; index -= 1) {
          const item = items[index];
          if (item?.kind === 'turn') {
            items[index] = { kind: 'turn', turn: { ...item.turn, status: 'stopped' } };
            break;
          }
        }
      }
      return { ...state, items, cursor: action.cursor, seenIds: new Set(action.items.map((item) => item.id)), liveTurnId: null, liveMessageId: null, hydrateFailed: false };
    }
    case 'hydrate/failed':
      return { ...state, hydrateFailed: true };
    default:
      return state;
  }
}

/** 用户停止意图（Esc/停止按钮）：settle 时标 stopped。无运行中轮次时忽略（迟到点击不污染下一轮）。 */
export function foldStopIntent(state: LiveThreadState): LiveThreadState {
  const turn = findTurn(state, state.liveTurnId);
  if (turn?.status !== 'running') return state;
  return { ...state, stopping: true };
}

function onTurnStarted(state: LiveThreadState, at: number): LiveThreadState {
  // 遗留 running 轮（错过 settle）先冻结为 completed
  let items = state.items;
  if (state.liveTurnId !== null) {
    items = items.map((item) =>
      item.kind === 'turn' && item.turn.id === state.liveTurnId && item.turn.status === 'running'
        ? { kind: 'turn', turn: { ...item.turn, status: 'completed', endedAt: at } }
        : item,
    );
  }
  const turn: TurnModel = {
    id: `${LIVE_TURN_PREFIX}${at}-${items.length}`,
    status: 'running',
    startedAt: at,
    endedAt: null,
    blocks: [],
  };
  return {
    ...state,
    items: [...items, { kind: 'turn', turn }],
    liveTurnId: turn.id,
    liveMessageId: null,
    streaming: true,
    retrying: null,
    crashed: false,
  };
}

function onToolEnded(
  state: LiveThreadState,
  callId: string,
  output: string,
  isError: boolean,
  diff: ReadonlyArray<{ path: string; additions: number; deletions: number }> | null,
  now: number,
): LiveThreadState {
  const startedAt = state.callStarts[callId];
  const durationMs = typeof startedAt === 'number' ? Math.max(0, now - startedAt) : null;
  let next = mapLiveCall(state, callId, (call) => ({
    ...call,
    output: clip(output),
    exitCode: isError ? 1 : 0,
    status: isError ? 'failed' : 'ok',
    durationMs,
  }));
  if (diff !== null && diff.length > 0 && next.liveTurnId !== null) {
    const turn = findTurn(next, next.liveTurnId);
    if (turn !== null) {
      next = updateTurn(next, turn.id, (current) => {
        const files: Array<{ path: string; additions: number; deletions: number }> = [];
        for (const block of current.blocks) {
          if (block.kind === 'diff') files.push(...block.diff.files.map((file) => ({ ...file })));
        }
        for (const file of diff) mergeDiffFile(files, file.path, file.additions, file.deletions);
        return {
          ...current,
          blocks: [
            ...current.blocks.filter((block) => block.kind !== 'diff'),
            {
              kind: 'diff',
              id: `diff-${current.id}`,
              diff: {
                changedFiles: files.length,
                additions: files.reduce((sum, file) => sum + file.additions, 0),
                deletions: files.reduce((sum, file) => sum + file.deletions, 0),
                files,
              },
            },
          ],
        };
      });
    }
  }
  return next;
}

/** message_update 的 partial 被 pai-cli 剥离时增量为空 id：挂到当前流式消息。 */
function resolveMessageId(state: LiveThreadState, messageId: string): string {
  return messageId.length > 0 ? messageId : state.liveMessageId ?? messageId;
}

function onMessageFinal(
  state: LiveThreadState,
  event: Extract<UiEvent, { type: 'messageFinal' }>,
): LiveThreadState {
  const turn = findTurn(state, state.liveTurnId);
  if (turn === null) return state;
  return updateTurn(state, turn.id, (current) => {
    let blocks = current.blocks.map((block) => {
      if (block.kind === 'text' && block.id === `text-${event.message.id}`) {
        return { ...block, text: clip(event.message.text) };
      }
      if (block.kind === 'thinking' && block.id === `think-${event.message.id}`) {
        return { ...block, text: clip(event.message.thinking) };
      }
      return block;
    });
    // 权威正文/思考若没有对应流式块（如零 delta 直接 message_end），补块
    if (event.message.text.length > 0 && !blocks.some((block) => block.kind === 'text' && block.id === `text-${event.message.id}`)) {
      blocks.push({ kind: 'text', id: `text-${event.message.id}`, text: clip(event.message.text) });
    }
    if (event.message.thinking.length > 0 && !blocks.some((block) => block.kind === 'thinking' && block.id === `think-${event.message.id}`)) {
      blocks.push({ kind: 'thinking', id: `think-${event.message.id}`, text: clip(event.message.thinking) });
    }
    // 流式未见的 toolCall（错过增量）补为完成态
    for (const call of event.message.toolCalls) {
      if (!blocks.some((block) => block.kind === 'tools' && block.calls.some((existing) => existing.id === call.id))) {
        blocks = appendToolCall(
          blocks,
          { id: call.id, name: call.name, argsPreview: call.argsPreview, output: '', exitCode: null, durationMs: null, status: 'running' },
          current.id,
        );
      }
    }
    return { ...current, blocks };
  });
}

function appendDelta(state: LiveThreadState, messageId: string, kind: 'text' | 'thinking', delta: string, now: number): LiveThreadState {
  const withTurn = ensureLiveTurn({ ...state, liveMessageId: messageId }, now);
  const turn = findTurn(withTurn, withTurn.liveTurnId);
  if (turn === null) return withTurn;
  const blockId = kind === 'text' ? `text-${messageId}` : `think-${messageId}`;
  return updateTurn(withTurn, turn.id, (current) => {
    const blocks = [...current.blocks];
    const index = blocks.findIndex((block) => block.id === blockId);
    if (index === -1) {
      blocks.push(kind === 'text' ? { kind: 'text', id: blockId, text: clip(delta) } : { kind: 'thinking', id: blockId, text: clip(delta) });
    } else {
      const block = blocks[index];
      if (block !== undefined && (block.kind === 'text' || block.kind === 'thinking')) {
        blocks[index] = { ...block, text: clip(block.text + delta) };
      }
    }
    return { ...current, blocks };
  });
}

function ensureLiveTurn(state: LiveThreadState, now: number): LiveThreadState {
  if (state.liveTurnId !== null && findTurn(state, state.liveTurnId) !== null) return state;
  return onTurnStarted({ ...state, streaming: true }, now);
}

function onSubagentTool(
  state: LiveThreadState,
  event: Extract<UiEvent, { type: 'subagentTool' }>,
  now: number,
): LiveThreadState {
  if (event.phase === 'start') {
    const key = `${event.subagentId}:${event.call.id}`;
    const withStart = { ...state, callStarts: { ...state.callStarts, [key]: now } };
    return upsertAgent(withStart, event.subagentId, now, (agent) => ({
      ...agent,
      toolCount: agent.toolCount + 1,
      tools: [
        ...agent.tools,
        { id: event.call.id, name: event.call.name, argsPreview: event.call.argsPreview, output: '', exitCode: null, durationMs: null, status: 'running' },
      ],
    }));
  }
  if (event.phase === 'update') {
    return upsertAgent(state, event.subagentId, now, (agent) => ({
      ...agent,
      tools: agent.tools.map((tool) => (tool.id === event.call.id ? { ...tool, output: clip(event.output ?? tool.output) } : tool)),
    }));
  }
  const startedAt = state.callStarts[`${event.subagentId}:${event.call.id}`];
  const durationMs = typeof startedAt === 'number' ? Math.max(0, now - startedAt) : null;
  return upsertAgent(state, event.subagentId, now, (agent) => ({
    ...agent,
    tools: agent.tools.map((tool) =>
      tool.id === event.call.id
        ? { ...tool, output: clip(event.output ?? tool.output), exitCode: event.isError === true ? 1 : 0, status: event.isError === true ? 'failed' : 'ok', durationMs }
        : tool,
    ),
  }));
}

function upsertAgent(
  state: LiveThreadState,
  subagentId: string,
  now: number,
  patch: (agent: SubagentModel) => SubagentModel,
): LiveThreadState {
  const existing = state.agents.find((agent) => agent.id === subagentId);
  if (existing === undefined) {
    const agent: SubagentModel = {
      id: subagentId,
      name: subagentId,
      agentType: '',
      model: '',
      effort: '',
      tokens: null,
      toolCount: 0,
      status: 'working',
      startedAt: now,
      endedAt: null,
      summary: '',
      tools: [],
    };
    return { ...state, agents: [...state.agents, patch(agent)] };
  }
  return {
    ...state,
    agents: state.agents.map((agent) => (agent.id === subagentId ? { ...patch(agent) } : agent)),
  };
}

function mapLiveCall(state: LiveThreadState, callId: string, patch: (call: ToolCallModel) => ToolCallModel): LiveThreadState {
  const turn = findTurn(state, state.liveTurnId);
  if (turn === null) return state;
  return updateTurn(state, turn.id, (current) => ({
    ...current,
    blocks: current.blocks.map((block) =>
      block.kind === 'tools'
        ? { ...block, calls: block.calls.map((call) => (call.id === callId ? patch(call) : call)) }
        : block,
    ),
  }));
}

function appendToolCall(blocks: readonly TurnBlock[], call: ToolCallModel, turnId: string): TurnBlock[] {
  const next = [...blocks];
  const index = next.findIndex((block) => block.kind === 'tools' && block.id === `tools-${turnId}`);
  if (index === -1) {
    next.push({ kind: 'tools', id: `tools-${turnId}`, calls: [call] });
  } else {
    const block = next[index];
    if (block?.kind === 'tools') {
      next[index] = { ...block, calls: [...block.calls, call] };
    }
  }
  return next;
}

function findTurn(state: LiveThreadState, turnId: string | null): TurnModel | null {
  if (turnId === null) return null;
  for (let index = state.items.length - 1; index >= 0; index -= 1) {
    const item = state.items[index];
    if (item?.kind === 'turn' && item.turn.id === turnId) return item.turn;
  }
  return null;
}

function updateTurn(state: LiveThreadState, turnId: string, patch: (turn: TurnModel) => TurnModel): LiveThreadState {
  return {
    ...state,
    items: state.items.map((item) => (item.kind === 'turn' && item.turn.id === turnId ? { kind: 'turn', turn: patch(item.turn) } : item)),
  };
}

function insertBeforeLiveTurn(items: readonly ThreadItem[], item: ThreadItem, liveTurnId: string | null): ThreadItem[] {
  if (liveTurnId === null) return [...items, item];
  const index = items.findIndex((existing) => existing.kind === 'turn' && existing.turn.id === liveTurnId);
  if (index === -1) return [...items, item];
  return [...items.slice(0, index), item, ...items.slice(index)];
}

function clip(text: string): string {
  return text.length > MAX_LIVE_CHARS ? text.slice(0, MAX_LIVE_CHARS) : text;
}
