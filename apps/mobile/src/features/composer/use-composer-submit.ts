import { useComposerStore } from '@/store/composer-store';
import { useConversationStore } from '@/store/conversation-store';

export function useComposerSubmit(): () => void {
  const draft = useComposerStore((state) => state.draft);
  const submitDraft = useComposerStore((state) => state.submitDraft);
  const appendMessage = useConversationStore((state) => state.appendMessage);
  return () => {
    const text = draft.trim();
    if (!submitDraft() || text.length === 0) return;
    appendMessage({ id: `user-${Date.now()}`, kind: 'user', text, createdAt: '刚刚' });
  };
}
