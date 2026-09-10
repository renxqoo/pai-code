import { describe, expect, test } from 'bun:test';

import { foldThreadEvent } from '../fold-events';
import { hydrateItems } from '../hydrate-items';
import { initialThreadState } from '../live-thread-state';
import type { HistoryItem, UiEvent } from '@paiapp/contracts';
import type { ThreadItem } from '@/thread/thread-model';

const T = 1_000;
const tick = (n: number): number => T + n;

function ev(event: UiEvent): UiEvent {
  return event;
}

function history(partial: Partial<HistoryItem> & Pick<HistoryItem, 'id' | 'kind'>): HistoryItem {
  if (partial.kind === 'user') return { text: '', origin: 'user', images: [], at: T, ...partial } as HistoryItem;
  return { text: '', thinking: '', toolCalls: [], usage: null, stopReason: null, errorMessage: null, at: T, ...partial } as HistoryItem;
}

function liveTurn(state: { items: readonly ThreadItem[] }): ThreadItem {
  const item = state.items[state.items.length - 1];
  if (item === undefined) throw new Error('no live turn');
  return item;
}

describe('foldEvents · 工具块按消息归块', () => {
  /** 工具循环事件序列：消息 a（思考→工具→diff）→ 消息 b（思考→正文→工具），block 序即到达序 */
  function toolLoopEvents(): UiEvent[] {
    return [
      ev({ type: 'turnStarted', threadId: 't', at: tick(0) }),
      ev({ type: 'messageStarted', threadId: 't', messageId: 'a', at: tick(1) }),
      ev({ type: 'thinkingDelta', threadId: 't', messageId: 'a', delta: '想一' }),
      ev({ type: 'toolCallAdded', threadId: 't', messageId: 'a', call: { id: 'c1', name: 'edit', argsPreview: 'x.ts' }, diff: null }),
      ev({ type: 'messageFinal', threadId: 't', message: { id: 'a', text: '', thinking: '想一', toolCalls: [{ id: 'c1', name: 'edit', argsPreview: 'x.ts' }], usage: null } }),
      ev({ type: 'toolEnded', threadId: 't', callId: 'c1', output: 'ok', isError: false, durationMs: 0, diff: [{ path: 'x.ts', additions: 2, deletions: 1 }] }),
      ev({ type: 'messageStarted', threadId: 't', messageId: 'b', at: tick(4) }),
      ev({ type: 'thinkingDelta', threadId: 't', messageId: 'b', delta: '想二' }),
      ev({ type: 'textDelta', threadId: 't', messageId: 'b', delta: '结论' }),
      ev({ type: 'toolCallAdded', threadId: 't', messageId: 'b', call: { id: 'c2', name: 'bash', argsPreview: 'ls' }, diff: null }),
      ev({ type: 'messageFinal', threadId: 't', message: { id: 'b', text: '结论', thinking: '想二', toolCalls: [{ id: 'c2', name: 'bash', argsPreview: 'ls' }], usage: null } }),
      ev({ type: 'turnSettled', threadId: 't', usage: null }),
    ];
  }

  test('症状回归：跨消息工具调用不并块、diff 恒挂轮末——工具置顶/思考挤后/轮中 diff 消失', () => {
    let s = initialThreadState;
    for (const event of toolLoopEvents()) s = foldThreadEvent(s, event, tick(9));
    const turn = liveTurn(s);
    if (turn?.kind !== 'turn') throw new Error('expected turn');
    expect(turn.turn.blocks.map((block) => [block.kind, block.id])).toEqual([
      ['thinking', 'think-a'],
      ['tools', 'tools-a'],
      ['thinking', 'think-b'],
      ['text', 'text-b'],
      ['tools', 'tools-b'],
      ['diff', `diff-${turn.turn.id}`],
    ]);
  });

  test('症状回归：live 块序与转写重建同构——settle 替换不重排视觉顺序', () => {
    let s = initialThreadState;
    for (const event of toolLoopEvents()) s = foldThreadEvent(s, event, tick(9));
    const liveTurnItem = liveTurn(s);
    if (liveTurnItem?.kind !== 'turn') throw new Error('expected turn');

    const rebuilt = hydrateItems([
      history({ kind: 'user', id: 'u1', text: '问' }),
      history({ kind: 'assistant', id: 'a1', thinking: '想一', at: tick(1), toolCalls: [{ id: 'c1', name: 'edit', argsPreview: 'x.ts', output: 'ok', isError: false, diff: [{ path: 'x.ts', additions: 2, deletions: 1 }] }] }),
      history({
        kind: 'assistant',
        id: 'a2',
        thinking: '想二',
        text: '结论',
        at: tick(4),
        toolCalls: [{ id: 'c2', name: 'bash', argsPreview: 'ls', output: '', isError: false, diff: null }],
      }),
    ]);
    const rebuiltTurn = rebuilt[rebuilt.length - 1];
    if (rebuiltTurn?.kind !== 'turn') throw new Error('expected rebuilt turn');
    expect(liveTurnItem.turn.blocks.map((block) => block.kind)).toEqual(rebuiltTurn.turn.blocks.map((block) => block.kind));
  });

  test('同一消息的多个工具调用并入同块（到达序）', () => {
    let s = initialThreadState;
    s = foldThreadEvent(s, ev({ type: 'turnStarted', threadId: 't', at: tick(0) }), tick(0));
    s = foldThreadEvent(s, ev({ type: 'messageStarted', threadId: 't', messageId: 'a', at: tick(1) }), tick(1));
    s = foldThreadEvent(s, ev({ type: 'toolCallAdded', threadId: 't', messageId: 'a', call: { id: 'c1', name: 'read', argsPreview: 'x' }, diff: null }), tick(2));
    s = foldThreadEvent(s, ev({ type: 'toolCallAdded', threadId: 't', messageId: 'a', call: { id: 'c2', name: 'read', argsPreview: 'y' }, diff: null }), tick(3));
    const turn = liveTurn(s);
    if (turn?.kind !== 'turn') throw new Error('expected turn');
    const tools = turn.turn.blocks.filter((block) => block.kind === 'tools');
    expect(tools.length).toBe(1);
    expect(tools[0]).toMatchObject({ id: 'tools-a', calls: [{ id: 'c1' }, { id: 'c2' }] });
  });

  test('空 messageId 的工具调用挂当前流式消息（liveMessageId 兜底）', () => {
    let s = initialThreadState;
    s = foldThreadEvent(s, ev({ type: 'turnStarted', threadId: 't', at: tick(0) }), tick(0));
    s = foldThreadEvent(s, ev({ type: 'messageStarted', threadId: 't', messageId: 'a', at: tick(1) }), tick(1));
    s = foldThreadEvent(s, ev({ type: 'toolCallAdded', threadId: 't', messageId: '', call: { id: 'c1', name: 'read', argsPreview: 'x' }, diff: null }), tick(2));
    const turn = liveTurn(s);
    if (turn?.kind !== 'turn') throw new Error('expected turn');
    const tools = turn.turn.blocks.find((block) => block.kind === 'tools');
    expect(tools).toMatchObject({ id: 'tools-a' });
  });

  test('messageFinal 补块挂消息块；重复 messageFinal 不重复补', () => {
    let s = initialThreadState;
    s = foldThreadEvent(s, ev({ type: 'turnStarted', threadId: 't', at: tick(0) }), tick(0));
    const messageFinal = ev({
      type: 'messageFinal',
      threadId: 't',
      message: { id: 'm', text: 'x', thinking: '', toolCalls: [{ id: 'ghost', name: 'read', argsPreview: 'a' }], usage: null },
    });
    s = foldThreadEvent(s, messageFinal, tick(5));
    s = foldThreadEvent(s, messageFinal, tick(6));
    const turn = liveTurn(s);
    if (turn?.kind !== 'turn') throw new Error('expected turn');
    const toolsBlocks = turn.turn.blocks.filter((block) => block.kind === 'tools');
    expect(toolsBlocks.length).toBe(1);
    expect(toolsBlocks[0]).toMatchObject({ id: 'tools-m', calls: [{ id: 'ghost' }] });
  });

  test('子代理事件不占轮内块：面板数据源只在 state.agents', () => {
    let s = initialThreadState;
    s = foldThreadEvent(s, ev({ type: 'turnStarted', threadId: 't', at: tick(0) }), tick(0));
    s = foldThreadEvent(s, ev({ type: 'messageStarted', threadId: 't', messageId: 'a', at: tick(1) }), tick(1));
    s = foldThreadEvent(s, ev({ type: 'toolCallAdded', threadId: 't', messageId: 'a', call: { id: 'c1', name: 'task', argsPreview: 'x' }, diff: null }), tick(2));
    s = foldThreadEvent(s, ev({ type: 'subagentStarted', threadId: 't', subagentId: 's1', agent: 'Explore', task: '查' }), tick(3));
    s = foldThreadEvent(s, ev({ type: 'messageStarted', threadId: 't', messageId: 'b', at: tick(4) }), tick(4));
    s = foldThreadEvent(s, ev({ type: 'thinkingDelta', threadId: 't', messageId: 'b', delta: '想' }), tick(5));
    const turn = liveTurn(s);
    if (turn?.kind !== 'turn') throw new Error('expected turn');
    expect(turn.turn.blocks.map((block) => block.kind)).toEqual(['tools', 'thinking']);
    expect(s.agents.map((agent) => agent.id)).toEqual(['s1']);
  });

  test('settle 终态化残留 running 调用（auto-retry 弃置的半成品不再走表）', () => {
    let s = initialThreadState;
    s = foldThreadEvent(s, ev({ type: 'turnStarted', threadId: 't', at: tick(0) }), tick(0));
    s = foldThreadEvent(s, ev({ type: 'toolCallAdded', threadId: 't', messageId: 'a', call: { id: 'c1', name: 'read', argsPreview: 'x' }, diff: null }), tick(1));
    s = foldThreadEvent(s, ev({ type: 'turnSettled', threadId: 't', usage: null }), tick(9));
    const turn = liveTurn(s);
    if (turn?.kind !== 'turn') throw new Error('expected turn');
    const tools = turn.turn.blocks.find((block) => block.kind === 'tools');
    expect(tools).toMatchObject({ calls: [{ id: 'c1', status: 'stopped' }] });
  });
});

describe('task 调用子代理清单透传（live 折叠与水化同源）', () => {
  test('toolCallAdded 携带 subagents → tools 块调用保留清单', () => {
    let s = initialThreadState;
    s = foldThreadEvent(s, ev({ type: 'turnStarted', threadId: 't', at: tick(0) }), tick(0));
    s = foldThreadEvent(
      s,
      ev({
        type: 'toolCallAdded',
        threadId: 't',
        messageId: 'a',
        call: { id: 'c1', name: 'task', argsPreview: 'Explore', subagents: [{ agent: 'Explore', task: '分析现状' }] },
        diff: null,
      }),
      tick(1),
    );
    const turn = liveTurn(s);
    if (turn?.kind !== 'turn') throw new Error('expected turn');
    const block = turn.turn.blocks.find((block): block is Extract<typeof block, { kind: 'tools' }> => block.kind === 'tools');
    expect(block?.calls[0]?.subagents).toEqual([{ agent: 'Explore', task: '分析现状' }]);
  });

  test('水化：task 工具透传 subagents，其余工具归一空数组', () => {
    const items = hydrateItems([
      history({
        id: 'a',
        kind: 'assistant',
        toolCalls: [
          { id: 'c1', name: 'task', argsPreview: 'Explore', output: 'done', isError: false, diff: null, subagents: [{ agent: 'Explore', task: '分析现状' }] },
          { id: 'c2', name: 'bash', argsPreview: 'ls', output: '', isError: false, diff: null },
        ],
      }),
    ]);
    const turn = items[0];
    if (turn?.kind !== 'turn') throw new Error('expected turn');
    const block = turn.turn.blocks[0];
    if (block?.kind !== 'tools') throw new Error('expected tools block');
    expect(block.calls[0]?.subagents).toEqual([{ agent: 'Explore', task: '分析现状' }]);
    expect(block.calls[1]?.subagents).toEqual([]);
  });
});
