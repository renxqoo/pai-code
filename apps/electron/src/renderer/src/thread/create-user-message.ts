import type { SessionMessage } from '@/thread/thread-model';

export type UserMessageResult = { ok: true; message: SessionMessage } | { ok: false; reason: 'blank' };

/** 从草稿构造用户消息：trim 后为空视为无效草稿；id 用 randomUUID 保证连续提交不重复。 */
export function createUserMessage(draft: string): UserMessageResult {
  const text = draft.trim();
  if (text.length === 0) {
    return { ok: false, reason: 'blank' };
  }
  return { ok: true, message: { id: crypto.randomUUID(), role: 'user', text } };
}
