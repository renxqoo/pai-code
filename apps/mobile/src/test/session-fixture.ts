/**
 * 测试用会话构造器：只被 __tests__ 引用，不进应用包。
 * 生产代码没有假数据源——会话一律来自 hub 的 thread/list。
 */
import type { ChatMessage, ConversationSession } from '@/types/domain';

export function testMessage(message: ChatMessage): ChatMessage {
  return { createdAt: '10:00', ...message };
}

export function testSession(id: string, over: Partial<ConversationSession> = {}): ConversationSession {
  return {
    id,
    title: `会话 ${id}`,
    preview: '',
    project: '/work/demo',
    timeLabel: '10:00',
    state: 'idle',
    pinned: false,
    archived: false,
    unread: false,
    messages: [],
    ...over,
  };
}