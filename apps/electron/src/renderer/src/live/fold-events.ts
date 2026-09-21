import type { UiEvent } from '@paiapp/contracts';
import type { ThreadItem, ToolCallModel, TurnBlock } from '@/thread/thread-model';

import { onSubagentEvent } from './fold-subagents';
import { mergeDiffFile } from './hydrate-items';
import { capSeenIds, noteCallStart, noteMessageTurn, omitCallStart, type LiveThreadState } from './live-thread-state';
import { beginLiveTurn, claimAnonymousBlocks, clip, ensureLiveTurn, findTurn, insertBeforeLiveTurn, updateTurn } from './turn-ops';


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
    case 'messageStarted': {
      // 重试成功后模型继续出消息：清除重试提示；新消息开始即旧思考段让位
      const started = ensureLiveTurn({ ...state, liveMessageId: event.messageId, retrying: null }, now);
      // 登记消息归属轮：迟到的 messageFinal（错序/重放）不得把旧轮权威内容补进新轮
      // （ensureLiveTurn 后必有 live 轮；null 分支仅类型层防御——无轮即无归属可登记）
      const ownerTurnId = started.liveTurnId;
      if (ownerTurnId === null) return clearThinkingStream(started);
      return clearThinkingStream({ ...started, messageTurns: noteMessageTurn(started.messageTurns, event.messageId, ownerTurnId) });
    }
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
      // 累积快照（非增量）：整体替换，拼接会把已产出的输出重复叠加
      return mapLiveCall(state, event.callId, (call) => ({ ...call, output: clip(event.output) }));
    case 'toolEnded':
      return onToolEnded(state, event.callId, event.output, event.isError, event.diff, now);
    case 'messageFinal':
      return onMessageFinal(state, event);
    case 'turnSettled': {
      // 结算代际（在途读口的代际守卫）：结算后到达的在途快照不得再点亮该轮。
      // 同时清轮边界：留旧边界会让下一轮的尾 span 归属吞掉上一轮的内容。
      state = { ...state, turnsSettled: state.turnsSettled + 1, turnStartSeq: null };
      // 用户停止 = abort：杀掉该对话全部子代理（前台+后台，无通知）；自然结束不动（后台任务跨轮）
      const agents =
        state.stopping && state.agents.some((agent) => agent.status !== 'stopped')
          ? state.agents.map((agent) => (agent.status === 'stopped' ? agent : { ...agent, status: 'stopped' as const, endedAt: now }))
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
          // ok=false 的异常终态提示（与转写重建 failureOf 同一展示面）：用户主动停止
          // 不算失败（stopping 分支已呈现 stopped），只有真实失败才挂错误块
          if (!event.ok && !stopped) {
            blocks.push({ kind: 'turnFailure', id: `fail-${item.turn.id}`, stopReason: 'error', message: event.reason ?? null });
          }
          return { kind: 'turn', turn: { ...item.turn, status: stopped ? ('stopped' as const) : ('completed' as const), endedAt: now, blocks, streamingThinkingBlockId: null } };
        }),
      };
    }
    case 'queueChanged':
      return { ...state, queue: { steering: [...event.steering], followUp: [...event.followUp] } };
    case 'compacting':
      return { ...state, compacting: event.active };
    case 'compacted':
      // 压缩落地：compacting 归位（landed 与 command/done 双路径幂等）。live items 的
      // 区间裁剪挂账——compaction/landed 无区间载荷，视图由下次 entries 水化对齐
      // （水化侧 surfaceOp replace 折叠已在 entries-mapper 落地）
      return { ...state, compacting: false };
    case 'retrying':
      return {
        ...state,
        retrying: { attempt: event.attempt, errorMessage: event.errorMessage },
      };
    case 'subagentStarted':
    case 'subagentDelta':
    case 'subagentTool':
    case 'subagentSettled':
    case 'subagentState':
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
      return state;
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

/** 会话运行面随宿主/worker 消亡就地终态：此后不会再有任何事件（turnSettled/queueChanged/compacted），
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
    agents: state.agents.map((agent) => (agent.status === 'stopped' ? agent : { ...agent, status: 'stopped' as const, endedAt: now })),
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
  return { ...beginLiveTurn(state, at), streaming: true, retrying: null, crashed: false };
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

/** 增量携带空 messageId（事件源未给消息身份的防御路径）时挂到当前流式消息。 */
function resolveMessageId(state: LiveThreadState, messageId: string): string {
  return messageId.length > 0 ? messageId : state.liveMessageId ?? messageId;
}

function onMessageFinal(
  state: LiveThreadState,
  event: Extract<UiEvent, { type: 'messageFinal' }>,
): LiveThreadState {
  // 跨轮守卫：该消息曾登记过归属轮且不属当前 live 轮（错序/重放的迟到权威快照）
  // → 丢弃——补进新轮会把旧轮正文拼接成双份/错位
  const owner = state.messageTurns[event.message.id];
  if (owner !== undefined && owner !== state.liveTurnId) return state;
  const turn = findTurn(state, state.liveTurnId);
  if (turn === null) return state;
  return updateTurn(state, turn.id, (current) => {
    // 权威身份到达即认领匿名块（重载落在消息流式中：增量空 id 折出的中转块），
    // 下方替换/补块才能寻址到它；不认领则同一条消息永久渲染成两个体
    let blocks = claimAnonymousBlocks(current.blocks, event.message.id).map((block) => {
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

/** 清 live 轮的思考流式态（新消息开始等让位点）；无 live 轮原样返回。 */
function clearThinkingStream(state: LiveThreadState): LiveThreadState {
  const turn = findTurn(state, state.liveTurnId);
  if (turn?.streamingThinkingBlockId == null) return state;
  return updateTurn(state, turn.id, (current) => ({ ...current, streamingThinkingBlockId: null }));
}

function mapLiveCall(state: LiveThreadState, callId: string, patch: (call: ToolCallModel) => ToolCallModel): LiveThreadState {
  const turn = findTurn(state, state.liveTurnId);
  if (turn === null) return state;
  // 未见过该 callId（孤儿 update/end）：返回原引用（真 no-op）——渲染层 memo 以
  // 引用为键，无谓重建会触发整轮重渲
  const seen = turn.blocks.some((block) => block.kind === 'tools' && block.calls.some((call) => call.id === callId));
  if (!seen) return state;
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
