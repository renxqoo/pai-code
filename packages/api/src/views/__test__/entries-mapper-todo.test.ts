import { describe, expect, test } from 'bun:test';

import { mapEntries } from '../entries-mapper';

/**
 * todo 面（T44）：todo 清单工具在对话流零痕迹（tool_use 块 / tool/call 均滤；
 * tool/result 天然失配丢弃）；todo/snapshot 折为快照返回（last-wins；窗口内
 * 无快照 = null——不得据此清既有快照）。
 */

function row(seq: number, ts: number, event: Record<string, unknown>): Record<string, unknown> {
  return { seq, ts, event };
}

const toolUse = (callId: string, name: string): Record<string, unknown> => ({
  type: 'tool_use',
  callId,
  name,
  input: {},
});

describe('todo 工具零痕迹', () => {
  test('assistant 条目内的 task_* tool_use 块被滤（非 todo 照常）', () => {
    const { items } = mapEntries({
      entries: [
        row(1, 100, {
          type: 'assistant/message',
          content: [
            { type: 'text', text: '开工' },
            toolUse('c1', 'task_create'),
            toolUse('c2', 'task_update'),
            toolUse('c3', 'bash'),
          ],
        }),
      ],
    });
    expect(items).toHaveLength(1);
    const assistant = items[0];
    expect(assistant?.kind).toBe('assistant');
    if (assistant?.kind !== 'assistant') return;
    expect(assistant.toolCalls.map((call) => call.name)).toEqual(['bash']);
  });

  test('tool/call task_* 不补面、tool/result 天然失配丢弃', () => {
    const { items } = mapEntries({
      entries: [
        row(1, 100, { type: 'assistant/message', content: [{ type: 'text', text: '查一下' }, toolUse('c1', 'task_list')] }),
        row(2, 200, { type: 'tool/call', callId: 'c1', name: 'task_list', arguments: '{}' }),
        row(3, 300, { type: 'tool/result', callId: 'c1', content: [{ type: 'text', text: '2 tasks' }], isError: false }),
      ],
    });
    expect(items).toHaveLength(1);
    const assistant = items[0];
    if (assistant?.kind !== 'assistant') throw new Error('expected assistant');
    expect(assistant.toolCalls).toEqual([]);
  });

  test('tool/call 先于 assistant/message 的 todo 补面暂存被滤（不回填）', () => {
    const { items } = mapEntries({
      entries: [
        row(1, 100, { type: 'tool/call', callId: 'c1', name: 'task_get', arguments: '{"taskId":"1"}' }),
        row(2, 200, { type: 'assistant/message', content: [{ type: 'text', text: '看一下' }, toolUse('c1', '')] }),
      ],
    });
    const assistant = items[0];
    if (assistant?.kind !== 'assistant') throw new Error('expected assistant');
    expect(assistant.toolCalls).toEqual([]);
  });
});

describe('todo/snapshot 折叠', () => {
  test('窗口内多快照 last-wins；快照不产生渲染条目', () => {
    const { items, todo } = mapEntries({
      entries: [
        row(1, 100, { type: 'todo/snapshot', seq: 1, tasks: [{ id: '1', subject: 'A', status: 'pending' }], edges: [] }),
        row(2, 200, { type: 'user/message', content: [{ type: 'text', text: '继续' }] }),
        row(3, 300, { type: 'todo/snapshot', seq: 2, tasks: [{ id: '1', subject: 'A', status: 'completed' }], edges: [] }),
      ],
    });
    expect(items).toHaveLength(1);
    expect(todo).toEqual({ seq: 2, tasks: [{ id: '1', subject: 'A', status: 'completed' }], edges: [] });
  });

  test('窗口内无快照 → null（调用方不得清既有快照）', () => {
    const { todo } = mapEntries({ entries: [row(1, 100, { type: 'user/message', content: [{ type: 'text', text: 'hi' }] })] });
    expect(todo).toBeNull();
    expect(mapEntries({ entries: [] }).todo).toBeNull();
  });

  test('垃圾形状快照跳过（不跌零、不崩）', () => {
    const { todo } = mapEntries({
      entries: [
        row(1, 100, { type: 'todo/snapshot', seq: 1, tasks: [{ id: '1', subject: 'A', status: 'pending' }], edges: [] }),
        row(2, 200, { type: 'todo/snapshot', seq: 'x', tasks: 'junk', edges: [] }),
      ],
    });
    expect(todo).toEqual({ seq: 1, tasks: [{ id: '1', subject: 'A', status: 'pending' }], edges: [] });
  });
});
