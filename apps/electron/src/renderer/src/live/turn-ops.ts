import type { ThreadItem, ToolCallModel, TurnBlock, TurnModel } from '@/thread/thread-model';

import type { LiveThreadState } from './live-thread-state';

/** 轮次定位/更新/创建与文本封顶：fold-events / fold-subagents / fold-inflight 共享。 */

/** 在途装饰轮的 id 前缀（区分转写派生的权威轮）。 */
const LIVE_TURN_PREFIX = 'live-turn-';

const MAX_TURN_CHARS = 4 * 1024 * 1024;

/** 从尾向前找轮（live 轮恒在尾部附近，避免长会话每次从头扫）。 */
export function findTurn(state: LiveThreadState, turnId: string | null): TurnModel | null {
  if (turnId === null) return null;
  for (let index = state.items.length - 1; index >= 0; index -= 1) {
    const item = state.items[index];
    if (item?.kind === 'turn' && item.turn.id === turnId) return item.turn;
  }
  return null;
}

export function updateTurn(state: LiveThreadState, turnId: string, patch: (turn: TurnModel) => TurnModel): LiveThreadState {
  return {
    ...state,
    items: state.items.map((item) => (item.kind === 'turn' && item.turn.id === turnId ? { kind: 'turn', turn: patch(item.turn) } : item)),
  };
}

export function clip(text: string): string {
  return text.length > MAX_TURN_CHARS ? text.slice(0, MAX_TURN_CHARS) : text;
}

/**
 * 建立新的在途轮（事件流的 turnStarted 与读口收敛共用单一实现）：
 * 遗留 running 轮（错过 settle）先冻结为 completed；已终结的装饰轮退场
 * （其权威内容由对账提供，残留会与后续插入的权威轮双显）。
 */
export function beginLiveTurn(state: LiveThreadState, at: number): LiveThreadState {
  let items = state.items;
  if (state.liveTurnId !== null) {
    items = items.map((item) =>
      item.kind === 'turn' && item.turn.id === state.liveTurnId && item.turn.status === 'running'
        ? { kind: 'turn', turn: { ...item.turn, status: 'completed' as const, endedAt: at } }
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
  return { ...state, items: [...items, { kind: 'turn', turn }], liveTurnId: turn.id, liveMessageId: null };
}

/** 条目插到在途轮之前（live 轮恒在尾部附近：从尾向前找，避免长会话每次从头扫）。 */
export function insertBeforeLiveTurn(items: readonly ThreadItem[], item: ThreadItem, liveTurnId: string | null): ThreadItem[] {
  if (liveTurnId === null) return [...items, item];
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const existing = items[index];
    if (existing?.kind === 'turn' && existing.turn.id === liveTurnId) {
      return [...items.slice(0, index), item, ...items.slice(index)];
    }
  }
  return [...items, item];
}

/** 轮不存在才建（增量到达 / 读口收敛的兜底建轮）。 */
export function ensureLiveTurn(state: LiveThreadState, at: number): LiveThreadState {
  if (state.liveTurnId !== null && findTurn(state, state.liveTurnId) !== null) return state;
  return beginLiveTurn({ ...state, streaming: true }, at);
}

/**
 * 同一消息两种成熟度（转写 / 在途快照 / 增量流）的 append-only 正文拼接。
 * 快照读点可能早于**或**晚于 live 已收增量：
 * - 一方是另一方前缀 → 取更长者；
 * - 一方是另一方**后缀**（快照晚于增量：live 只是快照的尾段）→ 取快照；
 * - 互不为前缀/后缀（增量先到、快照读取点更早）→ 快照 + live 拼接。
 * 直接拼接在「快照晚于增量」时会重复已收内容；一律取 live 则会丢转写里的权威前缀。
 */
export function mergeAppendOnlyText(snapshot: string, live: string): string {
  if (live.startsWith(snapshot)) return live;
  if (snapshot.startsWith(live) || snapshot.endsWith(live)) return snapshot;
  if (live.endsWith(snapshot)) return live;
  return `${snapshot}${live}`;
}

/** 匿名块 id（wire 剥离消息 id 后、身份确立前的中转身份，见 claimAnonymousBlocks）。 */
const ANON_TEXT_ID = 'text-';
const ANON_THINK_ID = 'think-';
const ANON_TOOLS_ID = 'tools-';

function isAnonymousBlock(block: TurnBlock): boolean {
  return block.id === ANON_TEXT_ID || block.id === ANON_THINK_ID || block.id === ANON_TOOLS_ID;
}

/**
 * 认领匿名块：wire（event-strip）把 message_update 的 message/partial 剥掉，重载落在
 * 消息流式中时重订阅续上的增量全部空 id，而 liveMessageId 要等读口快照（或 messageFinal）
 * 才能确立——此前折出的匿名块必须在身份确立时归位到 `*-${messageKey}`。不认领则孤儿块
 * 永久滞留：同一条消息渲染成「中段片段 + 正常块」两个体，messageFinal 的权威替换也
 * 寻址不到匿名块。归位即合并（append-only / callId 并集），无匿名块时原引用返回（幂等）。
 */
export function claimAnonymousBlocks(blocks: readonly TurnBlock[], messageKey: string): readonly TurnBlock[] {
  if (!blocks.some(isAnonymousBlock)) return blocks;
  const out = [...blocks];
  // 从尾向前处理：摘除/合并不影响更前面的待处理项下标；目标块可能在匿名块
  // 之前或之后（快照先落、匿名增量后到），全列扫描归位，无目标时按原位改名
  for (let index = out.length - 1; index >= 0; index -= 1) {
    const block = out[index];
    if (block === undefined || !isAnonymousBlock(block)) continue;
    out.splice(index, 1);
    if (block.kind === 'tools') {
      claimToolsBlock(out, `${ANON_TOOLS_ID}${messageKey}`, block, index);
    } else if (block.kind === 'text') {
      claimTextBlock(out, `${ANON_TEXT_ID}${messageKey}`, 'text', block.text, index);
    } else if (block.kind === 'thinking') {
      claimTextBlock(out, `${ANON_THINK_ID}${messageKey}`, 'thinking', block.text, index);
    }
  }
  return out;
}

function claimTextBlock(out: TurnBlock[], id: string, kind: 'text' | 'thinking', text: string, insertAt: number): void {
  const index = out.findIndex((block) => block.id === id && block.kind === kind);
  if (index === -1) {
    out.splice(insertAt, 0, { kind, id, text });
    return;
  }
  const existing = out[index];
  if (existing === undefined || existing.kind !== kind) return;
  out[index] = { ...existing, text: clip(mergeAppendOnlyText(existing.text, text)) };
}

function claimToolsBlock(out: TurnBlock[], id: string, anon: Extract<TurnBlock, { kind: 'tools' }>, insertAt: number): void {
  const index = out.findIndex((block) => block.id === id && block.kind === 'tools');
  if (index === -1) {
    out.splice(insertAt, 0, { ...anon, id });
    return;
  }
  const existing = out[index];
  if (existing?.kind !== 'tools') return;
  out[index] = { ...existing, calls: unionToolCalls(existing.calls, anon.calls) };
}

/** 调用并集：base 已有的整体保留（output 来自权威帧、durationMs 是客户端观测值），只补缺的 callId。 */
export function unionToolCalls(base: readonly ToolCallModel[], incoming: readonly ToolCallModel[]): ToolCallModel[] {
  const known = new Set(base.map((call) => call.id));
  const added = incoming.filter((call) => !known.has(call.id));
  return added.length === 0 ? [...base] : [...base, ...added];
}
