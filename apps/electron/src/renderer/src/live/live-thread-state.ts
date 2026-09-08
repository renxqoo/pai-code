import type { HistoryItem } from '@paiapp/contracts';
import type { ThreadItem, SubagentModel } from '@/thread/thread-model';

/**
 * 单线程折叠状态：转写条目（真相）+ 至多一个进行中的 live 轮次（流式装饰）。
 * 轮次边界以 turnStarted/turnSettled 对账：settle 后条目对账替换 live 轮次。
 */

export type QueueState = { steering: readonly string[]; followUp: readonly string[] };

export type RetryState = { attempt: number; maxAttempts: number; errorMessage: string };

export type LiveThreadState = {
  items: readonly ThreadItem[];
  agents: readonly SubagentModel[];
  /** get_entries 增量游标（null = 尚未水化）。 */
  cursor: string | null;
  /** 已并入的条目 id（对账去重；userMessage 事件同源）。 */
  seenIds: ReadonlySet<string>;
  /** 进行中/待对账的 live 轮次 id（null = 无）。 */
  liveTurnId: string | null;
  /** 当前流式消息 id（message_start..message_end 期间）。 */
  liveMessageId: string | null;
  /** 工具调用到达时刻（durationMs 客户端观测值）。 */
  callStarts: Readonly<Record<string, number>>;
  queue: QueueState;
  streaming: boolean;
  compacting: boolean;
  retrying: RetryState | null;
  /** 用户停止意图：settle 时把 live 轮标 stopped。 */
  stopping: boolean;
  /** worker 异常死亡横幅（下条命令自动恢复，收到 turnStarted 清除）。 */
  crashed: boolean;
  /** 水化失败（重试入口提示）。 */
  hydrateFailed: boolean;
  /** 是否已成功水化过（空会话 cursor 为 null，不能以 cursor 判定）。 */
  hydrated: boolean;
};

export const initialThreadState: LiveThreadState = {
  items: [],
  agents: [],
  cursor: null,
  seenIds: new Set<string>(),
  liveTurnId: null,
  liveMessageId: null,
  callStarts: {},
  queue: { steering: [], followUp: [] },
  streaming: false,
  compacting: false,
  retrying: null,
  stopping: false,
  crashed: false,
  hydrateFailed: false,
  hydrated: false,
};

/** 对账动作（非 UiEvent 的内部输入，controller 编排水化时派发）。 */
export type HydrateAction =
  | { kind: 'hydrate/initial'; items: readonly HistoryItem[]; cursor: string | null }
  | { kind: 'hydrate/reconcile'; items: readonly HistoryItem[]; cursor: string | null; dropLiveTurn: boolean }
  /** 全量重建（settle 对账）：条目真相整体替换 items，继承停止语义。 */
  | { kind: 'hydrate/rebuild'; items: readonly HistoryItem[]; cursor: string | null }
  | { kind: 'hydrate/failed' };
