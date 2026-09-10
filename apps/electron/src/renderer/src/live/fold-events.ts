import type { UiEvent } from '@paiapp/contracts';
import type { ThreadItem, ToolCallModel, TurnBlock, TurnModel } from '@/thread/thread-model';

import { onSubagentEvent } from './fold-subagents';
import { hydrateItems, hydrateNewItems, mergeDiffFile } from './hydrate-items';
import { capSeenIds, initialThreadState, noteCallStart, omitCallStart, type HydrateAction, type LiveThreadState } from './live-thread-state';
import { clip, findTurn, updateTurn } from './turn-ops';

/**
 * 事件折叠状态机（纯函数）：UiEvent + 对账动作 → 视图状态。
 * 语义锚点：
 * - 流式只拼 delta；messageFinal 权威替换；turnSettled 恰好一次终态（agent_end 多次不驱动终态）；
 * - 块序即到达序：text/thinking/tools 块按消息 id 归块、按首次到达定位；
 *   diff 恒挂轮末（转写重建 buildTurnBlocks 同一尾部语义）——
 *   settle 替换前后块序同构，视觉不重排；
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
          // 事件不带图片；带图消息经条目对账（turnStarted 拉取）到达
          images: [],
        },
      };
      return {
        ...state,
        seenIds: capSeenIds(new Set([...state.seenIds, event.message.id])),
        items: insertBeforeLiveTurn(state.items, message, state.liveTurnId),
      };
    }
    case 'messageStarted':
      // 重试成功后模型继续出消息：清除重试提示；新消息开始即旧思考段让位
      return clearThinkingStream(ensureLiveTurn({ ...state, liveMessageId: event.messageId, retrying: null }, now));
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
        subagents: event.call.subagents ?? [],
        output: '',
        exitCode: null,
        durationMs: null,
        status: 'running',
      };
      const messageId = resolveMessageId(withTurn, event.messageId);
      const withStart = { ...withTurn, callStarts: noteCallStart(withTurn.callStarts, event.call.id, now) };
      // 工具调用开始即思考段结束（模型转入行动，长工具轮不得挂「思考中」）
      return updateTurn(withStart, turn.id, (current) => ({
        ...current,
        blocks: appendToolCall(current.blocks, call, messageId),
        streamingThinkingBlockId: null,
      }));
    }
    case 'toolUpdated':
      return mapLiveCall(state, event.callId, (call) => ({ ...call, output: clip(call.output + event.output) }));
    case 'toolEnded':
      return onToolEnded(state, event.callId, event.output, event.isError, event.diff, now);
    case 'messageFinal':
      return onMessageFinal(state, event);
    case 'turnSettled': {
      // 用户停止 = abort：杀掉该对话全部子代理（前台+后台，无通知，api.md U2）；自然结束不动（后台任务跨轮）
      const agents =
        state.stopping && state.agents.some((agent) => agent.status === 'working')
          ? state.agents.map((agent) => (agent.status === 'working' ? { ...agent, status: 'done' as const, endedAt: now } : agent))
          : state.agents;
      if (state.liveTurnId === null) return { ...state, streaming: false, retrying: null, stopping: false, agents };
      const stopped = state.stopping;
      return {
        ...state,
        streaming: false,
        stopping: false,
        retrying: null,
        agents,
        liveMessageId: null,
        items: state.items.map((item) => {
          if (item.kind !== 'turn' || item.turn.id !== state.liveTurnId || item.turn.status !== 'running') return item;
          // 轮入终态：流式中断残留的 running 调用（如 auto-retry 弃置的半成品）一并定格，不再走表
          const blocks = item.turn.blocks.map((block) =>
            block.kind === 'tools' && block.calls.some((call) => call.status === 'running')
              ? { ...block, calls: block.calls.map((call) => (call.status === 'running' ? { ...call, status: 'stopped' as const } : call)) }
              : block,
          );
          return { kind: 'turn', turn: { ...item.turn, status: stopped ? ('stopped' as const) : ('completed' as const), endedAt: now, blocks, streamingThinkingBlockId: null } };
        }),
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
    case 'subagentDelta':
    case 'subagentText':
    case 'subagentTool':
    case 'subagentSettled':
    case 'subagentMessage':
      return onSubagentEvent(state, event, now);
    case 'sessionDied':
      // worker 死亡时全部在途子代理随进程自灭且无 settle 通知（api.md U2）：就地终态
      return { ...foldDeath(state, now), crashed: true };
    case 'sessionParked':
      // worker 收编（闲置/手动）：进程面随 worker 消亡就地终态，但不是崩溃——
      // 停留态可浏览（T27 只读历史），发消息自动唤醒；在途回合按 stopped 冻结
      // （retire 强收编打断的生成不得呈现为自然完成）
      return foldDeath(state, now, 'stopped');
    case 'bashOutput':
      // 直执行 bash 流式输出：只留尾部 2000 字符（横幅预览；权威条目经对账到达）
      return { ...state, bashTail: (state.bashTail + event.delta).slice(-2000) };
    case 'dialogRequest':
    case 'dialogSettled':
    case 'host':
    case 'sessionUpdated':
    case 'sessionRemoved':
    case 'sessionRenamed':
      return state;
    default:
      return state;
  }
}

export function foldHydrate(state: LiveThreadState, action: HydrateAction): LiveThreadState {
  switch (action.kind) {
    case 'hydrate/initial': {
      const items = hydrateItems(action.items);
      return { ...initialThreadState, items, cursor: action.cursor, seenIds: capSeenIds(new Set(action.items.map((item) => item.id))), hydrated: true };
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
      const seen = capSeenIds(new Set([...state.seenIds, ...action.items.map((item) => item.id)]));
      return { ...state, items, cursor: action.cursor ?? state.cursor, seenIds: seen, liveTurnId: liveTurn, hydrateFailed: false };
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
      return { ...state, items, cursor: action.cursor, seenIds: capSeenIds(new Set(action.items.map((item) => item.id))), liveTurnId: null, liveMessageId: null, hydrateFailed: false };
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

/** 会话运行面随宿主/worker 消亡就地终态：此后不会再有任何事件（settle/queue_update/compaction_end），
 * 滞留的 streaming 会把空闲会话的新消息判成生成中投递进永不消费的队列，队列/压缩/bash 同随进程消亡。
 * running 轮按 frozenStatus 冻结：崩溃/宿主死亡 = completed（错过 settle 的缺省形态），
 * 回收（sessionParked）= stopped——被回收打断的生成不得伪装成自然完成。权威内容由下次对账替换。 */
export function foldDeath(state: LiveThreadState, now: number, frozenStatus: 'completed' | 'stopped' = 'completed'): LiveThreadState {
  const items: readonly ThreadItem[] =
    state.liveTurnId === null
      ? state.items
      : state.items.map((item): ThreadItem =>
          item.kind === 'turn' && item.turn.id === state.liveTurnId && item.turn.status === 'running'
            ? { kind: 'turn', turn: { ...item.turn, status: frozenStatus, endedAt: now, streamingThinkingBlockId: null } }
            : item,
        );
  return {
    ...state,
    items,
    agents: state.agents.map((agent) => (agent.status === 'working' ? { ...agent, status: 'done' as const, endedAt: now } : agent)),
    queue: { steering: [], followUp: [] },
    streaming: false,
    compacting: false,
    retrying: null,
    stopping: false,
    bashRunning: false,
    bashTail: '',
    liveMessageId: null,
  };
}

function onTurnStarted(state: LiveThreadState, at: number): LiveThreadState {
  // 遗留 running 轮（错过 settle）先冻结为 completed；已终结的装饰轮退场
  // （其权威内容由对账提供，残留会与后续插入的权威轮双显）
  let items = state.items;
  if (state.liveTurnId !== null) {
    items = items.map((item) =>
      item.kind === 'turn' && item.turn.id === state.liveTurnId && item.turn.status === 'running'
        ? { kind: 'turn', turn: { ...item.turn, status: 'completed', endedAt: at } }
        : item,
    );
  }
  items = items.filter((item) => !(item.kind === 'turn' && item.turn.id.startsWith(LIVE_TURN_PREFIX) && item.turn.status !== 'running'));
  const turn: TurnModel = {
    id: `${LIVE_TURN_PREFIX}${at}-${items.length}`,
    status: 'running',
    startedAt: at,
    endedAt: null,
    blocks: [],
    streamingThinkingBlockId: null,
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
        const diffBlock: TurnBlock = {
          kind: 'diff',
          id: `diff-${current.id}`,
          diff: {
            changedFiles: files.length,
            additions: files.reduce((sum, file) => sum + file.additions, 0),
            deletions: files.reduce((sum, file) => sum + file.deletions, 0),
            files,
          },
        };
        // diff 旧块剥除后重挂轮末（唯一尾块语义）
        const withoutDiff = current.blocks.filter((block) => block.kind !== 'diff');
        return {
          ...current,
          blocks: [...withoutDiff, diffBlock],
        };
      });
    }
  }
  // durationMs 已定格，计时条目随即除名（长会话不累积）
  return { ...next, callStarts: omitCallStart(next.callStarts, callId) };
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
      insertBlock(blocks, { kind: 'text', id: `text-${event.message.id}`, text: clip(event.message.text) });
    }
    if (event.message.thinking.length > 0 && !blocks.some((block) => block.kind === 'thinking' && block.id === `think-${event.message.id}`)) {
      insertBlock(blocks, { kind: 'thinking', id: `think-${event.message.id}`, text: clip(event.message.thinking) });
    }
    // 流式未见的 toolCall（错过增量）补为完成态
    for (const call of event.message.toolCalls) {
      if (!blocks.some((block) => block.kind === 'tools' && block.calls.some((existing) => existing.id === call.id))) {
        blocks = appendToolCall(
          blocks,
          {
            id: call.id,
            name: call.name,
            argsPreview: call.argsPreview,
            subagents: call.subagents ?? [],
            output: '',
            exitCode: null,
            durationMs: null,
            status: 'running',
          },
          event.message.id,
        );
      }
    }
    // 消息定形（message_end）：该消息的思考段权威收束，流式态熄灭
    return { ...current, blocks, streamingThinkingBlockId: null };
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
      const block = kind === 'text' ? { kind: 'text' as const, id: blockId, text: clip(delta) } : { kind: 'thinking' as const, id: blockId, text: clip(delta) };
      insertBlock(blocks, block);
    } else {
      const block = blocks[index];
      if (block !== undefined && (block.kind === 'text' || block.kind === 'thinking')) {
        blocks[index] = { ...block, text: clip(block.text + delta) };
      }
    }
    // 思考激活态跟实际流走：thinking 增量亮、同消息正文开始（thinking 段已结束）灭
    return { ...current, blocks, streamingThinkingBlockId: kind === 'thinking' ? blockId : null };
  });
}

function ensureLiveTurn(state: LiveThreadState, now: number): LiveThreadState {
  if (state.liveTurnId !== null && findTurn(state, state.liveTurnId) !== null) return state;
  return onTurnStarted({ ...state, streaming: true }, now);
}

/** 清 live 轮的思考流式态（新消息开始等让位点）；无 live 轮原样返回。 */
function clearThinkingStream(state: LiveThreadState): LiveThreadState {
  const turn = findTurn(state, state.liveTurnId);
  if (turn?.streamingThinkingBlockId == null) return state;
  return updateTurn(state, turn.id, (current) => ({ ...current, streamingThinkingBlockId: null }));
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

/** 工具调用按消息归块（tools-${messageId}）：同一 assistant 消息内的调用并入同块，
 * 跨消息的块按到达序穿插——与转写重建（buildTurnBlocks）同构，settle 替换不重排视觉顺序。 */
function appendToolCall(blocks: readonly TurnBlock[], call: ToolCallModel, messageId: string): TurnBlock[] {
  const next = [...blocks];
  const blockId = `tools-${messageId}`;
  const index = next.findIndex((block) => block.kind === 'tools' && block.id === blockId);
  if (index === -1) {
    insertBlock(next, { kind: 'tools', id: blockId, calls: [call] });
  } else {
    const block = next[index];
    if (block?.kind === 'tools') {
      next[index] = { ...block, calls: [...block.calls, call] };
    }
  }
  return next;
}

/** 过程/正文新块原位插入：diff 恒挂轮末（尾部不变式，与转写重建同构），
 * 尾部块之后的到达块插到不变式区之前。 */
function insertBlock(blocks: TurnBlock[], block: TurnBlock): void {
  const tail = blocks.findIndex((existing) => existing.kind === 'diff');
  const at = tail === -1 ? blocks.length : tail;
  blocks.splice(at, 0, block);
}

function insertBeforeLiveTurn(items: readonly ThreadItem[], item: ThreadItem, liveTurnId: string | null): ThreadItem[] {
  if (liveTurnId === null) return [...items, item];
  // live 轮恒在尾部附近：从尾向前找，避免长会话每次插入从头扫
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const existing = items[index];
    if (existing?.kind === 'turn' && existing.turn.id === liveTurnId) {
      return [...items.slice(0, index), item, ...items.slice(index)];
    }
  }
  return [...items, item];
}
