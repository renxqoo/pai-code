import { imagePayloadOf } from '@/composer/read-image-file';
import type { QueuedDraftSubmit } from '@/composer/queued-drafts';
import { workspaceActions } from '@/live/workspace-runtime';

/** 排队暂存投递的单一实现（附件 PendingImage → ImagePayload 转换 + submitThreadDraft）：
 * 轮末冲刷连接器（use-live-workspace）与输入卡立即改向（ComposerRegion）同源消费，
 * 附件语义变化只改这一处。 */
export const submitQueuedDraft: QueuedDraftSubmit = (threadId, draft, mode) =>
  workspaceActions.submitThreadDraft(
    threadId,
    draft.text,
    draft.images.length === 0 ? undefined : draft.images.map((image) => imagePayloadOf(image.payload)),
    mode,
  );
