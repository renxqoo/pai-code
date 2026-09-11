import { describe, expect, test } from 'bun:test';
import type { UiEvent } from '@paiapp/contracts';

import { coalesceEvents } from '../coalesce-events';

function text(threadId: string, messageId: string, delta: string): UiEvent {
  return { type: 'textDelta', threadId, messageId, delta };
}

function think(threadId: string, messageId: string, delta: string): UiEvent {
  return { type: 'thinkingDelta', threadId, messageId, delta };
}

function turnStarted(threadId: string): UiEvent {
  return { type: 'turnStarted', threadId };
}

describe('coalesceEvents', () => {
  test('相邻同块 delta 拼接为一条', () => {
    const out = coalesceEvents([text('t', 'm', 'a'), text('t', 'm', 'b'), text('t', 'm', 'c')]);
    expect(out).toEqual([text('t', 'm', 'abc')]);
  });

  test('text 与 thinking 各自折叠、互不跨界', () => {
    const out = coalesceEvents([text('t', 'm', 'a'), think('t', 'm', 'x'), think('t', 'm', 'y'), text('t', 'm', 'b')]);
    expect(out).toEqual([text('t', 'm', 'a'), think('t', 'm', 'xy'), text('t', 'm', 'b')]);
  });

  test('跨线程/跨消息不合并', () => {
    const out = coalesceEvents([text('t1', 'm', 'a'), text('t2', 'm', 'b'), text('t1', 'm', 'c'), text('t1', 'm2', 'd')]);
    expect(out).toHaveLength(4);
  });

  test('被其他事件打断的同类 delta 不跨事件合并（保序）', () => {
    const out = coalesceEvents([text('t', 'm', 'a'), turnStarted('t'), text('t', 'm', 'b')]);
    expect(out).toEqual([text('t', 'm', 'a'), turnStarted('t'), text('t', 'm', 'b')]);
  });

  test('非 delta 事件原样透传且顺序不变', () => {
    const out = coalesceEvents([turnStarted('t1'), turnStarted('t2'), turnStarted('t1')]);
    expect(out).toEqual([turnStarted('t1'), turnStarted('t2'), turnStarted('t1')]);
  });

  test('空批与单事件批恒等返回', () => {
    expect(coalesceEvents([])).toEqual([]);
    const single = [text('t', 'm', 'a')];
    expect(coalesceEvents(single)).toBe(single);
  });

  test('全空 delta 也折叠（内容等价）', () => {
    const out = coalesceEvents([text('t', 'm', ''), text('t', 'm', '')]);
    expect(out).toEqual([text('t', 'm', '')]);
  });
});


describe('coalesceEvents · toolUpdated 批内折叠（T28 R11：chatty 工具输出与打字机同型）', () => {
  const tool = (callId: string, output: string) => ({ type: 'toolUpdated' as const, threadId: 't1', callId, output });

  test('症状回归「流式工具输出重复累积」：同 callId 相邻 toolUpdated 取最新快照为一条；不同 callId 不合并', () => {
    const events = [
      { type: 'textDelta' as const, threadId: 't1', messageId: 'm1', delta: 'a' },
      tool('c1', 'line1\n'),
      tool('c1', 'line1\nline2\n'),
      tool('c1', 'line1\nline2\nline3\n'),
      tool('c2', 'other'),
    ];
    const out = coalesceEvents(events);
    expect(out).toEqual([
      { type: 'textDelta', threadId: 't1', messageId: 'm1', delta: 'a' },
      { type: 'toolUpdated', threadId: 't1', callId: 'c1', output: 'line1\nline2\nline3\n' },
      { type: 'toolUpdated', threadId: 't1', callId: 'c2', output: 'other' },
    ]);
  });

  test('中间被其他事件打断则不跨段合并', () => {
    const events = [
      tool('c1', 'a'),
      { type: 'turnSettled' as const, threadId: 't1', at: 1 },
      tool('c1', 'b'),
    ];
    const out = coalesceEvents(events);
    expect(out.filter((event) => event.type === 'toolUpdated')).toHaveLength(2);
  });
});
