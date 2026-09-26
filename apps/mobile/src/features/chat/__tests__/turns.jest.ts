import { describe, expect, it } from '@jest/globals';
import { buildTurns } from '@/features/chat/turns';
import type { ChatMessage } from '@/types/domain';

type MessageValues = Pick<ChatMessage, 'id' | 'kind'> & Partial<Omit<ChatMessage, 'id' | 'kind'>>;

const message = (values: MessageValues): ChatMessage => ({
  text: values.id,
  createdAt: 'now',
  ...values,
});

const kinds = (messages: readonly ChatMessage[]): string[] => messages.map((item) => item.kind);

describe('buildTurns', () => {
  it('returns an empty turn list for empty input', () => {
    expect(buildTurns([])).toEqual([]);
  });

  it('treats a plain question turn with no process as the result itself', () => {
    const turns = buildTurns([
      message({ id: 'u1', kind: 'user', text: '问' }),
      message({ id: 'a1', kind: 'assistant', text: '答' }),
    ]);
    expect(turns).toHaveLength(1);
    expect(turns[0]?.result?.id).toBe('a1');
    expect(turns[0]?.stream).toEqual([]);
  });

  it('keeps narration before tools in the process stream and picks the post-tool text as result', () => {
    const turns = buildTurns([
      message({ id: 'u1', kind: 'user' }),
      message({ id: 'n1', kind: 'assistant', text: '先看看现状' }),
      message({ id: 'think', kind: 'thinking' }),
      message({ id: 'tool', kind: 'tool', status: 'success' }),
      message({ id: 'r1', kind: 'assistant', text: '已完成，结论如下' }),
    ]);
    expect(turns).toHaveLength(1);
    expect(turns[0]?.result?.id).toBe('r1');
    expect(kinds(turns[0]?.stream ?? [])).toEqual(['assistant', 'thinking', 'tool']);
    expect(turns[0]?.stream[0]?.id).toBe('n1');
  });

  it('never mistakes pre-tool narration for the result when the turn ends with a tool', () => {
    const turns = buildTurns([
      message({ id: 'u1', kind: 'user' }),
      message({ id: 'narration', kind: 'assistant', text: '正在搭建项目' }),
      message({ id: 'tool-a', kind: 'tool', status: 'success' }),
      message({ id: 'tool-b', kind: 'tool', status: 'running' }),
    ]);
    expect(turns[0]?.result).toBeNull();
    expect(turns[0]?.stream.map((item) => item.id)).toEqual(['narration', 'tool-a', 'tool-b']);
    expect(turns[0]?.running).toBe(true);
    expect(turns[0]?.failed).toBe(false);
  });

  it('splits multiple user turns and marks failed turns', () => {
    const turns = buildTurns([
      message({ id: 'u1', kind: 'user' }),
      message({ id: 't1', kind: 'tool', status: 'error' }),
      message({ id: 'a1', kind: 'assistant', text: '失败后的结果' }),
      message({ id: 'u2', kind: 'user' }),
      message({ id: 'a2', kind: 'assistant', text: '第二轮结果' }),
    ]);
    expect(turns).toHaveLength(2);
    expect(turns[0]?.result?.id).toBe('a1');
    expect(turns[0]?.failed).toBe(true);
    expect(turns[1]?.result?.id).toBe('a2');
    expect(turns[1]?.stream).toEqual([]);
    expect(turns[1]?.user?.id).toBe('u2');
  });

  it('excludes user messages and code artifacts from result selection', () => {
    const turns = buildTurns([
      message({ id: 'u1', kind: 'user' }),
      message({ id: 'tool', kind: 'tool', status: 'success' }),
      message({ id: 'code', kind: 'code', text: 'artifact' }),
      message({ id: 'r1', kind: 'assistant', text: '结果' }),
    ]);
    expect(turns[0]?.result?.id).toBe('r1');
    expect(kinds(turns[0]?.stream ?? [])).toEqual(['tool', 'code']);
  });
});
