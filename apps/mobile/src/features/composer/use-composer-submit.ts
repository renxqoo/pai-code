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
    if (text.length === 0) return;
    // 归档路径都拿不到的会话（宿主无投递目标）：不吞草稿、直接说明，
    // 否则只会得到一条「发送失败：unknown_thread」，用户无从下手。
    if (useConversationStore.getState().session.detached === true) {
      useConversationStore.getState().appendMessage({ id: `send-fail-${Date.now()}`, kind: 'status', text: copy.sendFailed(copy.detached), createdAt: new Date().toISOString(), status: 'failed', summary: copy.notDelivered });
      return;
    }
    if (!submitDraft()) return;
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
    /**
     * 失败原因取 error.message（host 错误码），不是 error.kind——
     * kind 只是 transient/permanent 分级，把它当原因会让所有失败都显示「transient」。
     * 用户已切走时不报错：消息留在原会话，错误行不该出现在无关的当前视图里。
     */
    const reportFailure = (target: string | null, reason: string): void => {
      if (target !== null && useConversationStore.getState().activeSessionId !== target) {
        useComposerStore.getState().setGenerating(false);
        return;
      }
      failNote(reason);
    };
    /** PC 侧闲置 park 过的会话在手机端发消息前先唤活（否则 host 无投递目标）。 */
    const promptLive = async (target: string): Promise<{ ok: boolean; switched?: true; error?: { message?: string } }> => {
      const revived = await reviveThread(target);
      const threadForSend = revived.ok ? revived.threadId : target;
      if (revived.ok && revived.threadId !== target) {
        if (useConversationStore.getState().activeSessionId !== null && useConversationStore.getState().activeSessionId !== target) return { ok: false, switched: true };
        useConversationStore.getState().openSession({ ...useConversationStore.getState().session, id: revived.threadId });
        attachThread(revived.threadId);
      }
      return (await bridge.client.invoke('session/prompt', { threadId: threadForSend, message: text })) as { ok: boolean; error?: { message?: string } };
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
        if (!prompted.ok && prompted.switched !== true) reportFailure(newThreadId, copyReason(prompted.error?.message));
        return;
      }
      const prompted = await promptLive(threadId);
      if (!prompted.ok && prompted.switched !== true) reportFailure(threadId, copyReason(prompted.error?.message));
    })();
    appendMessage({ id: `user-${Date.now()}`, kind: 'user', text, createdAt: new Date().toISOString(), ...(attachments.length > 0 ? { attachments } : {}) } as ChatMessage);
    clearAttachments();
  };
}
