import type { HistoryItem } from '@paiapp/contracts';
import type { ThreadItem, TurnBlock } from '@/thread/thread-model';

import { applyInflight, applyInflightOutputsToBlocks } from './fold-inflight';
import { hydrateItems, hydrateNewItems } from './hydrate-items';
import { capSeenIds, initialThreadState, type HydrateAction, type LiveThreadState } from './live-thread-state';
import { mergeSpanBlocks } from './merge-turn-blocks';
import { insertBeforeLiveTurn } from './turn-ops';

/**
 * 水化对账折叠（从 fold-events.ts 拆出，一文件一事）：转写载荷与在途读口视图 → 视图状态。
 * 语义见 tasks/T35：reconcile 的尾 span 合入在途轮（幂等并集）、窗口重建、在途读口合入。
 */

export function foldHydrate(state: LiveThreadState, action: HydrateAction): LiveThreadState {
  switch (action.kind) {
    case 'hydrate/inflight':
      return applyInflight(state, action.view, action.at);
    case 'hydrate/initial': {
      const items = hydrateItems(action.items);
      return { ...initialThreadState, items, cursor: action.cursor, seenIds: capSeenIds(new Set(action.items.map((item) => item.id))), hydrated: true };
    }
    case 'hydrate/reconcile': {
      const derived = hydrateNewItems(action.items);
      // 拆除 live 轮的两个前提：载荷确实覆盖该轮（窗口带回条目——空窗口意味着
      // 转写未到位，销毁现场就是丢内容）且线程非流式（在途轮的内容不在任何载荷
      // 里，权威替换只属于已结算的轮；流式中直执行等路径靠 liveTurnPresent
      // 降级为不拆轮 reconcile，这里是最后防线）
      const drop = action.dropLiveTurn && state.liveTurnId !== null && !state.streaming && action.items.length > 0;
      const liveTurn = drop ? null : state.liveTurnId;
      // 在途轮归属（不拆轮的对账遇 live 轮时）：末位用户消息之后的转写条目（尾 span）
      // 与 live 轮是同一轮的两种成熟度（重载回落场景：前半已落盘、后半走事件流）。
      // 块身份统一为消息时间戳后，「同一轮只渲染一个体」不再需要删内容——尾 span 的块
      // **合入**在途轮（幂等并集：同 id 保 live；tools 按 callId 并集），已落库的持久
      // 前缀轮按条目派生 id 精确收回（内容已并入）；span 内的 message 条目正常插入。
      const inFlightOwned = !drop && state.liveTurnId !== null;
      let lastMessageIndex = -1;
      for (let index = 0; index < derived.length; index += 1) {
        if ((derived[index]?.item.kind ?? null) === 'message') lastMessageIndex = index;
      }
      // 尾 span 起点 = **读口事实**（`turnStartEntryId` 之后的条目才属本轮）：它对轮内注入的
      // user 消息（task-notification/task-message）与 steer 中途插话免疫——「末位用户消息」
      // 启发式在这些情况下会把同一轮切错（切错即同轮双渲染）。读口不可用（null）时退回启发式
      // （降级口径，见 T35 §2.3）；增量窗口里找不到边界 = 窗口整体位于边界之后。
      const spanFrom = spanStartIndex(derived, state.turnStartEntryId, lastMessageIndex);
      const skippedTurnIds = new Set<string>();
      const spanBlocks: TurnBlock[] = [];
      const fresh: Array<{ item: ThreadItem; entryIds: readonly string[] }> = [];
      derived.forEach((entry, index) => {
        const inSpan = inFlightOwned && index >= spanFrom;
        if (inSpan && entry.item.kind === 'turn' && entry.item.turn.id !== state.liveTurnId) {
          spanBlocks.push(...entry.item.turn.blocks);
          skippedTurnIds.add(entry.item.turn.id);
          return;
        }
        if (entry.entryIds.some((id) => !state.seenIds.has(id))) fresh.push(entry);
      });
      let items = state.items;
      if (skippedTurnIds.size > 0) {
        items = items.filter((item) => !(item.kind === 'turn' && item.turn.id !== state.liveTurnId && skippedTurnIds.has(item.turn.id)));
      }
      // 轮计时锚点回填（读口无 `turnStartedAt` 时的兜底，如老 hub）：live 轮的 startedAt 若晚于
      // 本轮 prompt 的提交时刻（刷新后才看到第一个事件的时刻），回填到该时刻——与 hydrateItems
      // 的轮计时锚点同源。只回填更早值，绝不后移。
      const anchorAt = lastUserAt(action.items);
      if (liveTurn !== null && anchorAt !== null) {
        items = items.map((item) =>
          item.kind === 'turn' && item.turn.id === liveTurn && item.turn.startedAt > anchorAt
            ? { kind: 'turn' as const, turn: { ...item.turn, startedAt: anchorAt } }
            : item,
        );
      }
      if ((spanBlocks.length > 0 || state.inflightToolOutputs.length > 0) && liveTurn !== null) {
        items = items.map((item) =>
          item.kind === 'turn' && item.turn.id === liveTurn
            ? {
                kind: 'turn' as const,
                turn: {
                  ...item.turn,
                  blocks: applyInflightOutputsToBlocks(mergeSpanBlocks(item.turn.blocks, spanBlocks), state.inflightToolOutputs, null),
                },
              }
            : item,
        );
      }
      const wasStopped = drop
        ? items.some((item) => item.kind === 'turn' && item.turn.id === state.liveTurnId && item.turn.status === 'stopped')
        : false;
      for (const { item } of fresh) {
        items = insertBeforeLiveTurn(items, item, liveTurn);
      }
      if (drop) {
        items = items.filter((item) => !(item.kind === 'turn' && item.turn.id === state.liveTurnId));
      }
      // 权威替换继承用户停止语义：settle 前被停止的轮次保持 stopped 终态
      // （仅随拆除发生——空窗口时末轮是无关历史轮，不得误标）
      if (wasStopped) {
        for (let index = items.length - 1; index >= 0; index -= 1) {
          const item = items[index];
          if (item?.kind === 'turn') {
            items = [...items.slice(0, index), { kind: 'turn', turn: { ...item.turn, status: 'stopped' } }, ...items.slice(index + 1)];
            break;
          }
        }
      }
      const seen = capSeenIds(new Set([...state.seenIds, ...fresh.flatMap((entry) => [...entry.entryIds])]));
      // reconcile 也置 hydrated：重载冷启动走 reconcile 保流式现场时，后续
      // ensureHydrated 的守卫同样要看到「历史已装载」
      return { ...state, items, cursor: action.cursor ?? state.cursor, seenIds: seen, liveTurnId: liveTurn, hydrated: true, hydrateFailed: false };
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

/**
 * 尾 span 起点：读口事实优先（`turnStartEntryId` 所在派生条目的**下一条**）；
 * 读口不可用（null）→ 退回「末位用户消息之后」启发式；事实不在本窗口（增量载荷）→ 窗口整体。
 * 「整体」的隐含前提：渲染层不传 limit（全量/游标增量窗口），窗口要么含边界、
 * 要么整体在边界之后；一旦启用 get_entries 分页（limit），「窗口整体在边界之前」
 * 也会落到这里——届时需显式判别窗口与边界的位置关系，不得把历史轮吞进 live 轮。
 */
function spanStartIndex(
  derived: readonly { item: ThreadItem; entryIds: readonly string[] }[],
  turnStartEntryId: string | null,
  lastMessageIndex: number,
): number {
  if (turnStartEntryId === null) return lastMessageIndex + 1;
  for (let index = 0; index < derived.length; index += 1) {
    if (derived[index]?.entryIds.includes(turnStartEntryId) === true) return index + 1;
  }
  return 0;
}

/** 本轮 prompt 的提交时刻（转写里最后一条 user 条目；无则 null）。 */
function lastUserAt(items: readonly HistoryItem[]): number | null {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const item = items[index];
    if (item?.kind === 'user' && Number.isFinite(item.at)) return item.at;
  }
  return null;
}
