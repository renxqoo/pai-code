import * as React from 'react';
import { expect, test } from 'bun:test';
import { useStore } from 'zustand';

import type { HistoryItem, UiEvent } from '@paiapp/contracts';
import { createLiveStore, threadModelOf } from '@/live/store';
import { render } from '@/testing/render';
import { MessageList } from '../message-list';

/**
 * 流式直发的组件级极限渲染（性能门禁，非精确基准）：主进程逐事件 IPC、渲染层
 * useSyncExternalStore 直出——每个 delta 一次真实 React commit（act 逐事件驱动，
 * 与生产逐事件到达同节奏）。长历史 30 轮 + 逐 delta 增长的 markdown 正文，
 * 验证：预算内完成、终态 DOM 在场、历史轮 DOM 节点不移栽（reconcile 复用）。
 * 历史轮不重渲的 memo 前提（items 引用稳定）由 stream-throughput 的引用断言钉住。
 */

const THREAD = 't-render-stress';
const HISTORY_TURNS = 30;
const STREAM_CHUNKS = 240;
/** 预算：240 次 commit × streamdown 全量解析（基线实测 ~1s，≈4ms/commit），数量级余量。 */
const RENDER_BUDGET_MS = 8_000;

function historyItems(turn: number): HistoryItem[] {
  return [
    { kind: 'user', id: `u-${turn}`, text: `第 ${turn} 个需求`, origin: 'user', images: [], at: turn * 1_000 },
    {
      kind: 'assistant',
      id: `a-${turn}`,
      messageTs: turn * 1_000 + 1,
      text: `### 历史轮 ${turn}\n\n结论段落，含 **加粗**、\`行内码\` 与列表：\n\n- 要点一\n- 要点二\n\n\`\`\`ts\nconst answer = ${turn};\n\`\`\`\n`,
      thinking: '',
      at: turn * 1_000 + 2,
      toolCalls: [{ id: `c-${turn}`, name: 'grep', argsPreview: '-r pattern .', output: 'x'.repeat(80), isError: false, diff: null }],
      usage: null,
      stopReason: null,
      errorMessage: null,
    },
  ];
}

function streamChunk(index: number): string {
  const shapes = [
    '流式增量段落，逐事件到达并立即提交渲染。',
    '包含 **加粗**、`行内码` 与[链接](https://example.com)的混排。',
    '- 列表项 A\n- 列表项 B\n',
    '\n```ts\nconst token = %INDEX%;\n```\n\n',
  ];
  return (shapes[index % shapes.length] ?? '').replaceAll('%INDEX%', String(index));
}

function StreamStage({ store }: { store: ReturnType<typeof createLiveStore> }): React.JSX.Element {
  const model = useStore(store, (state) => threadModelOf(state, THREAD));
  return (
    <MessageList
      thread={model}
      now={0}
      loading={false}
      bottomInset={184}
      emptyTitle=""
      emptyHint=""
      retryLabel=""
      onOpenDiff={() => undefined}
      onEditUserMessage={() => undefined}
    />
  );
}

test('逐事件 commit 的流式渲染突增：预算内完成、终态精确、历史轮 DOM 不移栽', async () => {
  const store = createLiveStore();
  const items: HistoryItem[] = [];
  for (let turn = 0; turn < HISTORY_TURNS; turn += 1) items.push(...historyItems(turn));
  store.getState().setActiveThread(THREAD);
  store.getState().hydrate(THREAD, { kind: 'hydrate/initial', items, cursor: 'cursor-final' });

  const handle = render(<StreamStage store={store} />);
  const historyNode = document.querySelector('[data-turn-id="turn-a-29"]');
  if (historyNode === null) throw new Error('history_node_missing');

  const apply = (event: UiEvent): void => {
    React.act(() => {
      store.getState().applyEvent(event, Date.now());
    });
  };
  apply({ type: 'turnStarted', threadId: THREAD, at: 1 });
  apply({ type: 'messageStarted', threadId: THREAD, messageId: 'm-live', at: 1 });

  const chunks: string[] = ['## 压测正文\n\n'];
  for (let index = 0; index < STREAM_CHUNKS; index += 1) chunks.push(streamChunk(index));
  const expectedText = chunks.join('');

  const started = performance.now();
  for (const chunk of chunks) {
    apply({ type: 'textDelta', threadId: THREAD, messageId: 'm-live', delta: chunk });
  }
  // Shiki 高亮是异步资源：流末冲刷一拍，让挂起的解析落在 act 内（不留 act 外警告）
  await React.act(async () => {
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
  });
  const elapsed = performance.now() - started;

  // 终态 DOM 精确：最后一帧的权威内容在场（流式未丢尾）
  expect(handle.container.textContent).toContain(`const token = ${STREAM_CHUNKS - 1}`);
  // 历史轮 DOM 节点不移栽（同节点复用 = 轮组件未重挂载；文本仍在）
  expect(document.querySelector('[data-turn-id="turn-a-29"]')).toBe(historyNode);
  expect(historyNode.textContent).toContain('历史轮 29');

  // 终态 store 与 DOM 同源：live 文本 = 期望拼接
  const thread = store.getState().threads[THREAD];
  const liveTurn = thread?.items[thread.items.length - 1];
  const liveText =
    liveTurn !== undefined && liveTurn.kind === 'turn'
      ? (liveTurn.turn.blocks.find((block) => block.kind === 'text' && block.id === 'text-m-live') as { text: string } | undefined)?.text
      : undefined;
  expect(liveText).toBe(expectedText);

  expect(elapsed).toBeLessThan(RENDER_BUDGET_MS);

  handle.unmount();
});
