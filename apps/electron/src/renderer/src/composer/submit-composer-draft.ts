import type { ComposerAttachment } from '@/composer/prompt-card';
import { imagePayloadOf } from '@/composer/read-image-file';
import { queuedDrafts } from '@/composer/queued-drafts';
import { store as liveStore, workspaceActions } from '@/live/workspace-runtime';
import { isImmediateSubmit, submitDraftText } from '@/composer/submit-draft';
import { uiStore } from '@/ui/ui-store';

/**
 * 活跃会话的提交编排（T33：自 workspace-main 同构迁入）：生成中普通消息 =
 * 本地暂存（轮末冲刷）；直执行与行首斜杠命令不暂存；其余直发（附件转 ImagePayload）。
 * 流式判定读 store 真相（渲染帧快照可能落后一轮结算，落后会把该轮末消息错误暂存）。
 * resolve true = 已发出（PromptCard 据此清空附件）。
 */
export function submitComposerDraft(text: string, attachments: readonly ComposerAttachment[]): Promise<boolean> {
  const live = liveStore.getState();
  const threadId = live.activeThreadId ?? '';
  const trimmed = text.trim();
  const streaming = threadId === '' ? false : live.threads[threadId]?.streaming === true;
  if (streaming && trimmed.length > 0 && !isImmediateSubmit(text)) {
    const sessionPath = live.sessions[threadId]?.sessionPath ?? null;
    queuedDrafts.stage(threadId, sessionPath, trimmed, attachments.map(({ name, payload }) => ({ name, payload })));
    uiStore.getState().clearDraft(threadId);
    return Promise.resolve(true);
  }
  return submitDraftText(
    { actions: workspaceActions, clearDraft: () => uiStore.getState().clearDraft(threadId) },
    text,
    attachments.map((item) => imagePayloadOf(item.payload)),
    'auto',
  );
}
