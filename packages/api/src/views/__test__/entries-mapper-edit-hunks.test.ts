import { describe, expect, test } from 'bun:test';

import { mapEntries } from '../entries-mapper';

/** WAL 投影行 {seq, ts, event}（get_entries 响应 entries 元素的形状）。 */
function row(seq: number, ts: number, event: Record<string, unknown>): Record<string, unknown> {
  return { seq, ts, event };
}

/** edit 工具_use 块（参数在 input 键、JSON 字符串——内核 tool_use 词法）。 */
function editBlock(edits: readonly unknown[]): Record<string, unknown> {
  return {
    type: 'tool_use',
    callId: 'c1',
    name: 'edit',
    input: JSON.stringify({ path: 'src/a.ts', edits }),
  };
}

function assistantToolCall(event: Record<string, unknown>): Record<string, unknown> {
  return (event as { toolCalls: Record<string, unknown>[] }).toolCalls[0] as Record<string, unknown>;
}

describe('mapEntries：edit 补丁片段贯通到条目（渲染层展开「改了什么」的数据源）', () => {
  test('assistant/message 的 tool_use 参数 → editHunks', () => {
    const { items } = mapEntries({
      entries: [
        row(1, 100, { type: 'assistant/message', turn: 0, step: 0, content: [editBlock([{ oldText: 'a', newText: 'b' }])] }),
      ],
    });
    expect(assistantToolCall(items[0] as Record<string, unknown>)).toMatchObject({
      name: 'edit',
      editHunks: [{ oldText: 'a', newText: 'b' }],
    });
  });

  test('tool/call 先于 assistant/message 到达：终名参数补面后片段仍在', () => {
    const { items } = mapEntries({
      entries: [
        row(1, 100, {
          type: 'tool/call',
          callId: 'c1',
          name: 'edit',
          arguments: JSON.stringify({ path: 'src/a.ts', edits: [{ oldText: 'x', newText: 'y' }] }),
        }),
        row(2, 200, { type: 'assistant/message', turn: 0, step: 0, content: [{ type: 'tool_use', callId: 'c1', input: '{}' }] }),
        row(3, 300, { type: 'tool/result', callId: 'c1', name: 'edit', content: 'ok', isError: false }),
      ],
    });
    const call = assistantToolCall(items[0] as Record<string, unknown>);
    expect(call['name']).toBe('edit');
    expect(call['editHunks']).toEqual([{ oldText: 'x', newText: 'y' }]);
  });

  test('非编辑工具不带 editHunks 字段（wire 精简，与 subagents 同一约定）', () => {
    const { items } = mapEntries({
      entries: [
        row(1, 100, {
          type: 'assistant/message',
          turn: 0,
          step: 0,
          content: [{ type: 'tool_use', callId: 'c1', name: 'read', input: JSON.stringify({ path: 'a.ts' }) }],
        }),
      ],
    });
    expect(assistantToolCall(items[0] as Record<string, unknown>)).not.toHaveProperty('editHunks');
  });
});
