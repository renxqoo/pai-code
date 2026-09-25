import type { ChatMessage } from '@/types/domain';
import { groupTimeline } from '@/features/chat/timeline-blocks';

export type ExecutionTodo = {
  id: string;
  title: string;
  detail: string;
  state: 'done' | 'current' | 'pending';
};

export type ActiveExecution = {
  messages: readonly ChatMessage[];
  todos: readonly ExecutionTodo[];
  completed: number;
  total: number;
  durationMs: number;
};

export function selectActiveExecution(messages: readonly ChatMessage[]): ActiveExecution | null {
  const block = groupTimeline(messages).findLast((item) => item.kind === 'tools' && item.messages.some((message) => message.status === 'running'));
  if (block?.kind !== 'tools') return null;
  const currentIndex = block.messages.findIndex((message) => message.status === 'running');
  const todos = block.messages.map((message, index): ExecutionTodo => ({
    id: message.id,
    title: message.title ?? '执行工具',
    detail: message.summary ?? message.text,
    state: message.status === 'success' || (message.status === 'error' && index < currentIndex) ? 'done' : index === currentIndex ? 'current' : 'pending',
  }));
  return {
    messages: block.messages,
    todos,
    completed: todos.filter((todo) => todo.state === 'done').length,
    total: todos.length,
    durationMs: block.messages.reduce((sum, message) => sum + (message.durationMs ?? 0), 0),
  };
}

export function withoutActiveExecution(messages: readonly ChatMessage[]): readonly ChatMessage[] {
  const active = selectActiveExecution(messages);
  if (active === null) return messages;
  const activeIds = new Set(active.messages.map((message) => message.id));
  return messages.filter((message) => !activeIds.has(message.id));
}
