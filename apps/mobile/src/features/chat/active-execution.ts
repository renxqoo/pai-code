import type { ChatMessage } from "@/types/domain";
import { groupTimeline } from "@/features/chat/timeline-blocks";
import { copy } from "@/strings/zh";

export type ExecutionTodo = {
  id: string;
  title: string;
  detail: string;
  state: "done" | "failed" | "current" | "pending";
};

export type ActiveExecution = {
  messages: readonly ChatMessage[];
  todos: readonly ExecutionTodo[];
  completed: number;
  total: number;
  durationMs: number;
};

export function selectActiveExecution(messages: readonly ChatMessage[]): ActiveExecution | null {
  const block = groupTimeline(messages).findLast(
    (item) =>
      item.kind === "activity" &&
      item.messages.some((message) => message.kind === "tool" && message.status === "running"),
  );
  if (block?.kind !== "activity") return null;
  const tools = block.messages.filter((message) => message.kind === "tool");
  const currentIndex = tools.findIndex((message) => message.status === "running");
  const todos = tools.map((message, index): ExecutionTodo => ({
    id: message.id,
    title: message.title ?? copy.activityFallback,
    detail: message.summary ?? message.text,
    state:
      message.status === "error"
        ? "failed"
        : message.status === "success"
          ? "done"
          : index === currentIndex
            ? "current"
            : "pending",
  }));
  return {
    messages: block.messages,
    todos,
    completed: todos.filter((todo) => todo.state === "done").length,
    total: todos.length,
    durationMs: tools.reduce((sum, message) => sum + (message.durationMs ?? 0), 0),
  };
}

export function withoutActiveExecution(messages: readonly ChatMessage[]): readonly ChatMessage[] {
  const active = selectActiveExecution(messages);
  if (active === null) return messages;
  const activeIds = new Set(active.messages.map((message) => message.id));
  return messages.filter((message) => !activeIds.has(message.id));
}
