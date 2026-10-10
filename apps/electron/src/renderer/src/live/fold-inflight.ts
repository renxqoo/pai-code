import type { InflightMessageView, InflightToolView, InflightView } from '@x3code/contracts';
import type { ToolCallModel, TurnBlock } from '@/thread/thread-model';

import type { LiveThreadState } from './live-thread-state';
import { claimAnonymousBlocks, clip, ensureLiveTurn, findTurn, mergeAppendOnlyText, updateTurn } from './turn-ops';

/**
 * 在途快照合入（T35 M2b）：`session/inflight` 的视图 → 折叠态。
 *
 * 为什么需要它：刷新落在轮次进行中时，重载前已流出的那条消息**既没落盘**（worker 在
 * 消息定形后才写会话文件）、**也不在事件流里**（订阅建立前的增量已随旧渲染层消亡）。
 * 它只存在于 hub 在途面（get_inflight），读口是唯一来源。
 *
 * 合并语义（全部幂等，任一时点重复应用结果不变）：
 * - 文本/思考是 append-only：快照与 live 块必为前缀关系 → **取更长者**（不重复、不丢）；
 * - 工具调用：live 已有的调用整体保留（其 output 来自 tool_end 权威帧、durationMs 是
 *   客户端观测值），live 不认识的按快照补入（running + 参数）；
 * - 工具在途输出：**替换**（宿主保留的是累积快照的尾部），status 归 running，时长由
 *   `startedAt` 复原——这是「刷新后正在跑的工具卡不再空着」的来源；
 * - bash 在途：横幅（bashRunning）可重建；快照只有 command/startedAt，尾部输出由
 *   bashOutput 事件增量累积；
 * - `turnStartSeq` 非空 = 轮在途 → `streaming` 置真（避免把在途轮里的新消息误判为空闲）。
 */

export function applyInflight(state: LiveThreadState, view: InflightView, now: number): LiveThreadState {
  const turnStartSeq = view.turnStartSeq;
  let next: LiveThreadState =
    state.turnStartSeq === turnStartSeq
      ? state
      : { ...state, turnStartSeq };
  // 在途输出随轮存活：转写重建（尾 span 合入）也要按 callId 把「转写说已完成、读口说仍在跑」
  // 的调用纠回 running（权威序 ①），否则工具执行中刷新会呈现「假完成 + 空输出」。
  if (state.inflightToolOutputs !== view.toolOutputs) next = { ...next, inflightToolOutputs: view.toolOutputs };

  if (turnStartSeq !== null && !next.streaming) next = { ...next, streaming: true };

  // 有在途轮就建轮（不只在有在途消息时）：工具执行期 streamingMessage 为 null，但本轮仍有
  // 在途事实（工具输出/bash），没有 live 轮这些事实无处落脚，转写前缀会被插成独立历史轮。
  // 轮边界缺失（读口不可用）而在途消息仍在时同样建轮——否则正文无处落块。
  if (turnStartSeq !== null || view.message !== null) next = ensureLiveTurn(next, now);

  // 轮计时取轮首事实（刷新后续算）：hub 报的轮首时刻优先于「本渲染层看到第一个事件的时刻」。
  if (turnStartSeq !== null && view.turnStartedAt !== null) {
    const startedAt = view.turnStartedAt;
    next = updateTurn(next, next.liveTurnId ?? '', (current) => ({ ...current, startedAt }));
  }

  if (view.message !== null) {
    const turn = findTurn(next, next.liveTurnId);
    if (turn !== null) {
      // 消息身份仍用 messageTs（正文/思考靠它对齐）；工具块另用 callId 集合
      const messageKey = String(view.message.messageTs);
      next = updateTurn(next, turn.id, (current) => ({
        ...current,
        // 身份确立即认领匿名块（重订阅后、读口响应前折出的空 id 增量块），否则孤儿中段片段永久滞留
        blocks: mergeInflightMessage(
          // 只认领正文/思考：匿名 tools 块必须由 mergeInflightMessage 按 callId
          // 键认领（认到 messageTs 键会与下面的 tools-calls:* 不同源 → 双渲染）
          claimAnonymousTextBlocks(current.blocks, messageKey),
          view.message as InflightMessageView,
          messageKey,
        ),
        streamingThinkingBlockId: null,
      }));
      next = { ...next, liveMessageId: messageKey };
    }
  }

  if (view.toolOutputs.length > 0) next = applyToolOutputs(next, view.toolOutputs, now);

  // bash 在途：横幅点亮；快照只给 command/startedAt，尾部输出由 bashOutput 事件累积
  // （重载场景存量输出不可得，横幅先亮、后续增量照常拼接）
  if (view.bash !== null) next = { ...next, bashRunning: true };

  return next;
}

/**
 * 只认领匿名正文/思考块（`text-`/`think-`），**不碰 tools**——
 * 工具块的身份是 callId 集合，由 mergeInflightMessage 用对应键认领。
 * 两处用同一个 messageTs 键认领会把匿名 tools 认到 `tools-7`，而合并写的是
 * `tools-calls:c1`，同一批调用仍然双渲染（这正是本改动要治的）。
 */
export function claimAnonymousTextBlocks(blocks: readonly TurnBlock[], messageKey: string): readonly TurnBlock[] {
  return blocks.some((block) => block.id === 'text-' || block.id === 'think-')
    ? claimAnonymousBlocks(blocks, messageKey)
    : blocks;
}

/**
 * 块身份用 **callId 集合**，不用 messageTs。
 *
 * 三条数据路径的「消息身份」本就不同源：转写用 WAL 行 ts、收敛读口用
 * turnStartedAt、live 流用 `stream-N` 计数器。用它们当块 id 的话，刷新
 * 落在工具执行中时，同一批调用在 inflight 组与转写组各渲染一次（实测
 * 双份正文 + 两组工具行，其中一组还丢 editHunks）。
 *
 * callId 是协议级的调用身份，在三条路径上天然一致——用它当主键，三路对齐
 * 就不依赖「消息时间戳恰好相等」这种不成立的前提。
 */
function toolsBlockKey(message: InflightMessageView): string {
  const ids = message.toolCalls.map((call) => call.id).filter((id) => id.length > 0);
  // 无 callId（hub 在途快照未给）时退回 messageTs——退化路径，不影响正常对齐
  return ids.length > 0 ? `calls:${ids.join(',')}` : `ts:${message.messageTs}`;
}

function mergeInflightMessage(
  blocks: readonly TurnBlock[],
  message: InflightMessageView,
  /** 消息身份键（正文/思考用；工具块另用 callId 集合） */
  messageKey: string,
): TurnBlock[] {
  // 空正文不建块（思考先行时建一个空 text 块会在正文位置留一行空行）
  let out = message.text.length > 0 ? upsertText(blocks, `text-${messageKey}`, message.text, 'text') : [...blocks];
  if (message.thinking.length > 0) out = upsertText(out, `think-${messageKey}`, message.thinking, 'thinking');
  if (message.toolCalls.length > 0) {
    // 匿名 tools 块按 callId 键归位，再合并（键同源才不双渲染）
    const key = toolsBlockKey(message);
    out = upsertToolCalls(claimAnonymousBlocks(out, key), `tools-${key}`, message.toolCalls);
  }
  return out;
}

/**
 * 文本/思考：同一消息的两种成熟度拼接（append-only）。
 * - 一方是另一方的前缀 → 取更长者（快照晚于增量：live 只是快照的前缀；反之亦然）；
 * - 互不为前缀 → 快照（读到时刻的全文）+ live（其后的增量）拼接——重载后先收到增量、
 *   快照读取点又落在增量之前时即此形态，拼接才是完整正文（两侧都不是对方的前缀）。
 */
function upsertText(blocks: readonly TurnBlock[], id: string, text: string, kind: 'text' | 'thinking'): TurnBlock[] {
  const next = [...blocks];
  const index = next.findIndex((block) => block.id === id);
  if (index === -1) {
    insertBlock(next, { kind, id, text: clip(text) });
    return next;
  }
  const existing = next[index];
  if (existing === undefined || (existing.kind !== 'text' && existing.kind !== 'thinking')) return next;
  next[index] = { ...existing, text: clip(mergeAppendOnlyText(text, existing.text)) };
  return next;
}

/** 工具调用：live 已有的保 live（含 output/durationMs），缺失的补（running + 参数）。 */
function upsertToolCalls(
  blocks: readonly TurnBlock[],
  id: string,
  calls: InflightMessageView['toolCalls'],
): TurnBlock[] {
  const next = [...blocks];
  const index = next.findIndex((block) => block.id === id);
  const incoming: ToolCallModel[] = calls.map((call) => ({
    id: call.id,
    name: call.name,
    argsPreview: call.argsPreview,
    subagents: call.subagents ?? [],
    editHunks: call.editHunks ?? [],
    output: '',
    exitCode: null,
    durationMs: null,
    status: 'running',
  }));
  if (index === -1) {
    insertBlock(next, { kind: 'tools', id, calls: incoming });
    return next;
  }
  const existing = next[index];
  if (existing?.kind !== 'tools') return next;
  const known = new Set(existing.calls.map((call) => call.id));
  const added = incoming.filter((call) => !known.has(call.id));
  next[index] = added.length === 0 ? existing : { ...existing, calls: [...existing.calls, ...added] };
  return next;
}

/** 在途输出：按 callId 替换输出并保持 running（宿主侧是累积快照的尾部）。 */
function applyToolOutputs(state: LiveThreadState, outputs: readonly InflightToolView[], now: number): LiveThreadState {
  const turn = findTurn(state, state.liveTurnId);
  if (turn === null) return state;
  return updateTurn(state, turn.id, (current) => ({ ...current, blocks: applyInflightOutputsToBlocks(current.blocks, outputs, now) }));
}

/**
 * 把在途输出套到工具块上（权威序 ①）：命中 callId 的调用置 **running** 并用快照输出替换——
 * 转写对「结果未落」与「跑完但输出为空」不可区分（`entries-mapper` 对无 toolResult 的调用给
 * `output:''/isError:false`），采信它会把仍在跑的工具砸成假完成态。`now` 为 null 时不动时长
 * （转写重建路径没有时钟，时长交给下一次读口/结算）。
 */
export function applyInflightOutputsToBlocks(
  blocks: readonly TurnBlock[],
  outputs: readonly InflightToolView[],
  now: number | null,
): TurnBlock[] {
  if (outputs.length === 0) return [...blocks];
  return blocks.map((block) =>
    block.kind === 'tools'
      ? {
          ...block,
          calls: block.calls.map((call) => {
            const entry = outputs.find((item) => item.callId === call.id);
            if (entry === undefined) return call;
            const elapsed = now !== null && entry.startedAt > 0 ? Math.max(0, now - entry.startedAt) : null;
            return {
              ...call,
              output: clip(entry.output),
              status: 'running' as const,
              durationMs: call.durationMs ?? elapsed,
            };
          }),
        }
      : block,
  );
}

/** 过程/正文新块原位插入：diff 恒挂轮末（尾部不变式，与转写重建同构）。 */
function insertBlock(blocks: TurnBlock[], block: TurnBlock): void {
  const tail = blocks.findIndex((existing) => existing.kind === 'diff');
  const at = tail === -1 ? blocks.length : tail;
  blocks.splice(at, 0, block);
}
