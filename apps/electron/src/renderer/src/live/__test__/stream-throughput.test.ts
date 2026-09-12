import { expect, test } from 'bun:test';

import type { HistoryItem, UiEvent } from '@paiapp/contracts';
import type { ThreadItem } from '@/thread/thread-model';
import { createLiveStore, threadModelOf } from '../store';

/**
 * IPC 直发后的流式极限吞吐（性能门禁，非精确基准）：无批折叠——每个 delta
 * 一次 store.set、一次订阅通知（useSyncExternalStore 直出路径）。长历史下
 * 逐事件折叠必须保持线性成本；预算按数量级余量钉死，超预算 = 折叠/订阅面
 * 出现超线性回归（如逐事件全量重建、订阅泄漏）。
 */

const THREAD = 't-perf';
const HISTORY_TURNS = 120;
/** 规模放大到超线性回归必爆预算的程度（二次方拼接/全量重建在此规模是 GB 级拷贝）。 */
const STREAM_DELTAS = 20_000;
/** 预算：20k delta × 长历史 + 8 订阅者 ≈ 10 倍基线余量（基线实测 ~60ms，≈3µs/delta）。 */
const THROUGHPUT_BUDGET_MS = 600;

function historyItems(turn: number): HistoryItem[] {
  return [
    { kind: 'user', id: `u-${turn}`, text: `提问 ${turn}`, origin: 'user', images: [], at: turn * 1_000 },
    {
      kind: 'assistant',
      id: `a-${turn}`,
      messageTs: turn * 1_000 + 1,
      text: `## 第 ${turn} 轮\n历史正文，**加粗**与 \`code\` 与列表：\n\n- 甲\n- 乙\n`,
      thinking: '',
      at: turn * 1_000 + 2,
      toolCalls: [{ id: `c-${turn}`, name: 'read', argsPreview: 'a.ts', output: 'x'.repeat(120), isError: false, diff: null }],
      usage: null,
      stopReason: null,
      errorMessage: null,
    },
  ];
}

function seedLongHistory(store: ReturnType<typeof createLiveStore>): { historyTail: ThreadItem } {
  const items: HistoryItem[] = [];
  for (let turn = 0; turn < HISTORY_TURNS; turn += 1) items.push(...historyItems(turn));
  // 水化走生产形态（转写权威轮），非 live 前缀轮（会被后续轮次逐轮过滤）
  store.getState().setActiveThread(THREAD);
  store.getState().hydrate(THREAD, { kind: 'hydrate/initial', items, cursor: `cursor-${HISTORY_TURNS}` });
  const seeded = store.getState().threads[THREAD]?.items ?? [];
  const historyTail = seeded[seeded.length - 1];
  if (historyTail === undefined) throw new Error('seed_failed');
  return { historyTail };
}

/** 订阅面模拟 thread-stage 的选择器组（每 set 一次、每订阅者读一次快照）。 */
function attachSubscribers(store: ReturnType<typeof createLiveStore>, count: number): { notified: () => number; detach: () => void } {
  let notifications = 0;
  const detachers: Array<() => void> = [];
  for (let index = 0; index < count; index += 1) {
    detachers.push(
      store.subscribe((state) => {
        notifications += 1;
        void threadModelOf(state, THREAD);
        void state.sessions;
        void state.dialogs;
        void state.activeThreadId;
      }),
    );
  }
  return { notified: () => notifications, detach: () => detachers.forEach((off) => off()) };
}

test('长历史下逐条 textDelta 直发折叠：吞吐在预算内、终态精确、历史条目引用稳定', () => {
  const store = createLiveStore();
  const { historyTail } = seedLongHistory(store);
  const subscribers = attachSubscribers(store, 8);
  const apply = (event: UiEvent): void => store.getState().applyEvent(event, Date.now());

  apply({ type: 'turnStarted', threadId: THREAD, at: 1 });
  apply({ type: 'messageStarted', threadId: THREAD, messageId: 'm-live', at: 1 });

  const tokens = ['流式', '增量', '逐条', '直发', '，', '性能', '回归', '。', 'token ', '中文混排 '];
  const deltas: UiEvent[] = [];
  const expectedParts: string[] = [];
  for (let index = 0; index < STREAM_DELTAS; index += 1) {
    const token = tokens[index % tokens.length] ?? '';
    expectedParts.push(token);
    deltas.push({ type: 'textDelta', threadId: THREAD, messageId: 'm-live', delta: token });
  }

  const started = performance.now();
  for (const event of deltas) apply(event);
  const elapsed = performance.now() - started;

  const thread = store.getState().threads[THREAD];
  if (thread === undefined) throw new Error('thread_missing');
  const liveTurn = thread.items[thread.items.length - 1];
  const liveText =
    liveTurn !== undefined && liveTurn.kind === 'turn'
      ? (liveTurn.turn.blocks.find((block) => block.kind === 'text' && block.id === 'text-m-live') as { text: string } | undefined)?.text
      : undefined;

  // 终态精确：N 个逐条到达的 delta 拼出精确全文（无丢序/丢字/重复）
  expect(liveText).toBe(expectedParts.join(''));
  // 每事件每个订阅者恰好一次通知（无合并丢失、无重复派发：轮首 2 事件 + N delta）× 8
  expect(subscribers.notified()).toBe((STREAM_DELTAS + 2) * 8);
  // 历史尾条目引用稳定（MessageList/TurnGroup memo 的命中前提，逐事件不重渲历史）
  expect(thread.items[thread.items.length - 2]).toBe(historyTail);
  subscribers.detach();
  expect(elapsed).toBeLessThan(THROUGHPUT_BUDGET_MS);
});

test('多线程背靠背风暴：4 线程交错 4000 事件（直发无批的同步突发形态）终态各归其位', () => {
  const store = createLiveStore();
  const apply = (event: UiEvent): void => store.getState().applyEvent(event, Date.now());
  const THREADS = ['t-a', 't-b', 't-c', 't-d'] as const;
  const ROUND = 1_000;
  const expected: Record<string, string> = {};

  for (const threadId of THREADS) {
    apply({ type: 'turnStarted', threadId, at: 1 });
    apply({ type: 'messageStarted', threadId, messageId: `m-${threadId}`, at: 1 });
    expected[threadId] = '';
  }
  // 背靠背交错（一个同步任务内连续到达——直发 IPC 在 chatty 输出期的真实形态）
  for (let index = 0; index < ROUND; index += 1) {
    for (const [slot, threadId] of THREADS.entries()) {
      const token = `${threadId}#${index} `;
      expected[threadId] += token;
      apply({ type: 'textDelta', threadId, messageId: `m-${threadId}`, delta: token });
      if (index % 50 === slot) {
        // 混入工具累积快照与 bash 尾巴（同一风暴窗口内的异质事件）
        apply({ type: 'toolUpdated', threadId, callId: `c-${threadId}`, output: `out-${index}` });
        apply({ type: 'bashOutput', threadId, delta: `tail-${index}` });
      }
    }
  }

  for (const threadId of THREADS) {
    const thread = store.getState().threads[threadId];
    const liveTurn = thread?.items[thread.items.length - 1];
    const text =
      liveTurn !== undefined && liveTurn.kind === 'turn'
        ? (liveTurn.turn.blocks.find((block) => block.kind === 'text') as { text: string } | undefined)?.text
        : undefined;
    expect(text).toBe(expected[threadId]);
  }
});
