import { useComposerStore } from '@/store/composer-store';
import { useConversationStore } from '@/store/conversation-store';
import { useAttachmentStore } from '@/store/attachment-store';
import { useDemoModeStore } from '@/store/demo-mode-store';
import { attachThread, getBridge } from '@/mobile/bridge-runtime';
import type { ChatMessage } from '@/types/domain';

/**
 * 发送路径：演示模式走本地回显（UI 原型行为）；连接模式走 hub——
 * 无活跃线程时 session/start（新建），随后 session/prompt（同线程续聊）。
 * 应答为受理；流式渲染由事件泵驱动（session-sync 的 userMessage 事件做权威回显）。
 */
export function useComposerSubmit(): () => void {
  const draft = useComposerStore((state) => state.draft);
  const submitDraft = useComposerStore((state) => state.submitDraft);
  const appendMessage = useConversationStore((state) => state.appendMessage);
  const items = useAttachmentStore((state) => state.items);
  const clearAttachments = useAttachmentStore((state) => state.clearAttachments);
  return () => {
    const text = draft.trim();
    if (!submitDraft() || text.length === 0) return;
    const attachments = items.map((item) => ({ ...item }));
    const demo = useDemoModeStore.getState().enabled;
    const bridge = getBridge();
    if (demo || bridge?.status !== 'ready') {
      appendMessage({ id: `user-${Date.now()}`, kind: 'user', text, createdAt: new Date().toISOString(), ...(attachments.length > 0 ? { attachments } : {}) } as ChatMessage);
      clearAttachments();
      return;
    }
    const store = useConversationStore.getState();
    const threadId = store.activeSessionId;
    const workspace = store.session.project;
    void (async () => {
      if (threadId === null) {
        const outcome = (await bridge.client.invoke('session/start', { cwd: workspace, trusted: true })) as { ok: boolean; data?: { threadId?: string } };
        if (!outcome.ok || typeof outcome.data?.threadId !== 'string') return;
        const newThreadId = outcome.data.threadId;
        useConversationStore.getState().openSession({ ...store.session, id: newThreadId });
        attachThread(newThreadId);
        await bridge.client.invoke('session/prompt', { threadId: newThreadId, message: text });
        return;
      }
      await bridge.client.invoke('session/prompt', { threadId, message: text });
    })();
    appendMessage({ id: `user-${Date.now()}`, kind: 'user', text, createdAt: new Date().toISOString(), ...(attachments.length > 0 ? { attachments } : {}) } as ChatMessage);
    clearAttachments();
  };
}
