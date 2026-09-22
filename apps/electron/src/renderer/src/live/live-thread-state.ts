import type { HistoryItem, InflightToolView, InflightView, QueueEntry } from '@paiapp/contracts';
import type { ThreadItem, SubagentModel } from '@/thread/thread-model';

/**
 * 单线程折叠状态：转写条目（真相）+ 至多一个进行中的 live 轮次（流式装饰）。
 * 轮次边界以 turnStarted/turnSettled 对账：settle 后条目对账替换 live 轮次。
 */

export type QueueState = { steering: readonly QueueEntry[]; followUp: readonly QueueEntry[] };

/** 自动重试进行中（attempt 为重试序号；hub 不暴露上限）。 */
export type RetryState = { attempt: number; errorMessage: string };

export type LiveThreadState = {
  items: readonly ThreadItem[];
  agents: readonly SubagentModel[];
  /** get_entries 增量游标（WAL seq；null = 尚未水化）。 */
  cursor: number | null;
  /** 已并入的条目 id（对账去重；userMessage 事件同源）。 */
  seenIds: ReadonlySet<string>;
  /** 进行中/待对账的 live 轮次 id（null = 无）。 */
  liveTurnId: string | null;
  /** 本轮持久前缀边界（读口 `get_inflight.turnStartSeq`：turn/start 时刻的 WAL seq）。
   * settle 窗口重建与尾 span 归属共用这一权威事实；读口不可用时为 null（settle 退化为
   * 全量拉取）。结算即清（留旧边界会吞掉上一轮）。 */
  turnStartSeq: number | null;
  /** 最近一次读口回报的在途工具输出（权威序 ①：转写说已完成、这里说仍在跑 → running）。 */
  inflightToolOutputs: readonly InflightToolView[];
  /** 当前流式消息 id（messageStarted..messageFinal 期间）。 */
  liveMessageId: string | null;
  /** 工具调用到达时刻（durationMs 客户端观测值）。 */
  callStarts: Readonly<Record<string, number>>;
  /** messageId → 所属轮（messageStarted 时登记）：迟到 messageFinal 的跨轮污染守卫。 */
  messageTurns: Readonly<Record<string, string>>;
  /** live 轮 id 的单调序（跨 rebuild 持续递增）：轮 id 全局唯一是迟到 messageFinal
   *  归属守卫的事实基础——同毫秒重启轮/重建后再开轮不得复用旧 id。 */
  turnSerial: number;
  queue: QueueState;
  streaming: boolean;
  compacting: boolean;
  retrying: RetryState | null;
  /** 用户停止意图：settle 时把 live 轮标 stopped。 */
  stopping: boolean;
  /** worker 异常死亡横幅（下条命令自动恢复，收到 turnStarted 清除）。 */
  crashed: boolean;
  /** fork 换轨终态：旧 id 已被 hub 移除（会话文件保留可懒恢复），运行面
   * 就地收敛且不再有任何事件驱动——排队冲刷等轮结算侦测必须排除。 */
  parked: boolean;
  /** 水化失败（重试入口提示）。 */
  hydrateFailed: boolean;
  /** 是否已成功水化过（空会话 cursor 为 null，不能以 cursor 判定）。 */
  hydrated: boolean;
  /** 已结算轮次计数（收敛读口的代际守卫：读在途期间发生过结算 → 该在途快照已过期）。 */
  turnsSettled: number;
  /** 直执行 bash 在途（`!` 命令；横幅呈现，停止键转中止）。 */
  bashRunning: boolean;
  /** 直执行 bash 的流式输出尾部（bashOutput 增量，封顶 2000 字符）。 */
  bashTail: string;
};

export const initialThreadState: LiveThreadState = {
  items: [],
  agents: [],
  cursor: null,
  seenIds: new Set<string>(),
  liveTurnId: null,
  turnStartSeq: null,
  inflightToolOutputs: [],
  liveMessageId: null,
  callStarts: {},
  messageTurns: {},
  turnSerial: 0,
  queue: { steering: [], followUp: [] },
  streaming: false,
  compacting: false,
  retrying: null,
  stopping: false,
  crashed: false,
  parked: false,
  hydrateFailed: false,
  hydrated: false,
  turnsSettled: 0,
  bashRunning: false,
  bashTail: '',
};

/** 对账动作（非 UiEvent 的内部输入，controller 编排水化时派发）。 */
export type HydrateAction =
  /** 在途读口收敛（T35 M2b）：`session/inflight` 视图合入折叠态（幂等）。 */
  | { kind: 'hydrate/inflight'; view: InflightView; at: number }
  | { kind: 'hydrate/initial'; items: readonly HistoryItem[]; cursor: number | null }
  | { kind: 'hydrate/reconcile'; items: readonly HistoryItem[]; cursor: number | null; dropLiveTurn: boolean }
  /** 全量重建（settle 对账）：条目真相整体替换 items，继承停止语义。 */
  | { kind: 'hydrate/rebuild'; items: readonly HistoryItem[]; cursor: number | null }
  | { kind: 'hydrate/failed' };

/**
 * 无界增长治理：seenIds/callStarts 都是「在途辅助表」，长会话必须封顶。
 * seenIds 的去重主保障是 cursor 区间（只前进），seenIds 是双保险——
 * 超限按插入序淘汰最旧一批（Set/Object 迭代序即写入序）。
 */
const SEEN_IDS_LIMIT = 5000;
const SEEN_IDS_TRIM_TO = 4000;
const CALL_STARTS_LIMIT = 1024;

export function capSeenIds(seen: ReadonlySet<string>): ReadonlySet<string> {
  if (seen.size <= SEEN_IDS_LIMIT) return seen;
  const next = new Set(seen);
  let dropped = 0;
  const excess = seen.size - SEEN_IDS_TRIM_TO;
  for (const id of seen) {
    if (dropped >= excess) break;
    next.delete(id);
    dropped += 1;
  }
  return next;
}

/** 工具计时写入：超限保留最新一半（在途工具数量远小于上限，裁剪只发生在异常堆积）。 */
export function noteCallStart(table: Readonly<Record<string, number>>, callId: string, at: number): Readonly<Record<string, number>> {
  const merged = { ...table, [callId]: at };
  const keys = Object.keys(merged);
  if (keys.length <= CALL_STARTS_LIMIT) return merged;
  const keep = new Set(keys.slice(keys.length - Math.floor(CALL_STARTS_LIMIT / 2)));
  const next: Record<string, number> = {};
  for (const key of keys) {
    const value = merged[key];
    if (keep.has(key) && value !== undefined) next[key] = value;
  }
  return next;
}

/** 消息归属轮写入：与 callStarts 同款封顶（超限保留最新一半）。键序依赖插入序=时序：
 *  键必须非整数样（整数样键按数值序先于插入序）且不重注册（覆写不移动键位）——
 *  生产形态 messageId 恒为 `stream-<n>` 前缀（event-mapper 单调生成），满足约束。 */
export function noteMessageTurn(table: Readonly<Record<string, string>>, messageId: string, turnId: string): Readonly<Record<string, string>> {
  const merged = { ...table, [messageId]: turnId };
  const keys = Object.keys(merged);
  if (keys.length <= CALL_STARTS_LIMIT) return merged;
  const keep = new Set(keys.slice(keys.length - Math.floor(CALL_STARTS_LIMIT / 2)));
  const next: Record<string, string> = {};
  for (const key of keys) {
    const value = merged[key];
    if (keep.has(key) && value !== undefined) next[key] = value;
  }
  return next;
}

/** 工具结束即除名（durationMs 已定格，条目不再有用途）。 */
export function omitCallStart(table: Readonly<Record<string, number>>, callId: string): Readonly<Record<string, number>> {
  if (!(callId in table)) return table;
  const next: Record<string, number> = {};
  for (const [key, value] of Object.entries(table)) {
    if (key !== callId) next[key] = value;
  }
  return next;
}
