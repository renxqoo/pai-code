import { useElapsedNow } from '@/features/chat/use-elapsed-now';
import type { ConversationSession } from '@/types/domain';

// 会话级工作时长：working 实时推进，终态冻结到 endedAtMs。
export function useSessionElapsed(session: ConversationSession): number | undefined {
  const now = useElapsedNow(session.state === 'working');
  const start = session.startedAtMs;
  if (start === undefined) return undefined;
  const end = session.endedAtMs ?? (session.state === 'working' ? now : undefined);
  if (end === undefined) return undefined;
  return Math.max(0, end - start);
}
