import { useComposerStore } from '@/store/composer-store';
import { useConversationStore } from '@/store/conversation-store';
import { useAttachmentStore } from '@/store/attachment-store';
import { useDemoModeStore } from '@/store/demo-mode-store';
import { attachThread, getBridge, reviveThread } from '@/mobile/relay/runtime';
import { copy, copyReason } from '@/strings/zh';
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
    // cwd 真值优先（R3 M4：显示名建错工作区）；无路径选择时回退显示名（演示态）
    const workspace = store.workspacePath ?? store.session.project;
    const failNote = (reason: string): void => {
      // 发送失败可见化（M6）：状态行入流——不再静默吞错
      useConversationStore.getState().appendMessage({ id: `send-fail-${Date.now()}`, kind: 'status', text: copy.sendFailed(reason), createdAt: new Date().toISOString(), status: 'failed', summary: copy.notDelivered });
      useComposerStore.getState().setGenerating(false);
    };
    /** PC 侧闲置 park 过的会话在手机端发消息前先唤活（否则 host 无投递目标）。 */
    const promptLive = async (target: string): Promise<{ ok: boolean; error?: { kind?: string } }> => {
      const revived = await reviveThread(target);
      const threadForSend = revived.ok ? revived.threadId : target;
      if (revived.ok && revived.threadId !== target) {
        if (useConversationStore.getState().activeSessionId !== null && useConversationStore.getState().activeSessionId !== target) return { ok: false };
        useConversationStore.getState().openSession({ ...useConversationStore.getState().session, id: revived.threadId });
        attachThread(revived.threadId);
      }
      return (await bridge.client.invoke('session/prompt', { threadId: threadForSend, message: text })) as { ok: boolean; error?: { kind?: string } };
    };
    void (async () => {
      if (threadId === null) {
        const outcome = (await bridge.client.invoke('session/start', { cwd: workspace, trusted: true })) as { ok: boolean; data?: { threadId?: string }; error?: { message?: string } };
        if (!outcome.ok || typeof outcome.data?.threadId !== 'string') {
          failNote(outcome.ok ? copy.sessionCreateFailed : copyReason(outcome.error?.message));
          return;
        }
        const newThreadId = outcome.data.threadId;
        if (useConversationStore.getState().activeSessionId !== null && useConversationStore.getState().activeSessionId !== newThreadId) return; // 用户已切换
        useConversationStore.getState().openSession({ ...store.session, id: newThreadId });
        attachThread(newThreadId);
        const prompted = await promptLive(newThreadId);
        if (!prompted.ok) failNote(copyReason(prompted.error?.kind));
        return;
      }
      const prompted = await promptLive(threadId);
      if (!prompted.ok) failNote(copyReason(prompted.error?.kind));
    })();
    appendMessage({ id: `user-${Date.now()}`, kind: 'user', text, createdAt: new Date().toISOString(), ...(attachments.length > 0 ? { attachments } : {}) } as ChatMessage);
    clearAttachments();
  };
}
