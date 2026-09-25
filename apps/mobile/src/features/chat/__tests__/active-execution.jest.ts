import { describe, expect, it } from '@jest/globals';
import { selectActiveExecution, withoutActiveExecution } from '@/features/chat/active-execution';
import type { ChatMessage } from '@/types/domain';


describe('active execution selection', () => {
  const messages: readonly ChatMessage[] = [
    { id: 'done', kind: 'tool', text: 'done', title: 'done', status: 'success', createdAt: 'now', durationMs: 100 },
    { id: 'current', kind: 'tool', text: 'current', title: 'current', status: 'running', createdAt: 'now', durationMs: 200 },
    { id: 'pending', kind: 'tool', text: 'pending', title: 'pending', createdAt: 'now' },
  ];

  it('selects the active contiguous tool group and builds todos', () => {
    const execution = selectActiveExecution(messages);
    expect(execution).toMatchObject({ completed: 1, total: 3, durationMs: 300 });
    expect(execution?.todos.map((todo) => todo.state)).toEqual(['done', 'current', 'pending']);
  });

  it('preserves failed steps as failed todos', () => {
    const execution = selectActiveExecution([
      { id: 'failed', kind: 'tool', text: 'failed', status: 'error', createdAt: 'now' },
      { id: 'current', kind: 'tool', text: 'current', status: 'running', createdAt: 'now' },
    ]);
    expect(execution?.todos.map((todo) => todo.state)).toEqual(['failed', 'current']);
    expect(execution?.completed).toBe(0);
  });

  it('removes only the active execution from the timeline', () => {
    expect(withoutActiveExecution(messages)).toEqual([]);
    expect(withoutActiveExecution([{ id: 'history', kind: 'tool', text: 'history', status: 'success', createdAt: 'now' }])).toHaveLength(1);
  });

  it('returns null when no tool is running', () => {
    expect(selectActiveExecution([{ id: 'done', kind: 'tool', text: 'done', status: 'success', createdAt: 'now' }])).toBeNull();
  });
});
