import { copy } from '@/strings';
import { focusComposer, restoreComposerImages, setDraftAndFocus } from '@/composer/composer-controller';
import { workspaceActions } from '@/live/workspace-runtime';
import { uiStore } from '@/ui/ui-store';

/**
 * 分叉重发与编辑重发（T33：自 use-fork-message hook 同构迁为模块函数）：
 * fork 到该用户消息之前，autoResend=true 原样重发（含图片），否则回填草稿
 * （分叉出的新会话槽——不得写旧会话键）与附件（图片经一次性 restore 信号）。
 * 仅水化消息可分叉（live 回显是 UUID，对账后才有 `seq-<n>` 条目 id——判定在调用侧消息行）；
 * 条目 id → WAL seq 解析在 workspaceActions.forkFromEntry（live/entry-seq 单一真相）。
 */

export function forkUserMessage(
  entryId: string,
  text: string,
  images: ReadonlyArray<{ data: string; mimeType: string }>,
  autoResend: boolean,
): void {
  void workspaceActions.forkFromEntry(entryId).then((newThreadId) => {
    if (newThreadId === null) return;
    const payloads = images.map((image) => ({ type: 'image' as const, data: image.data, mediaType: image.mimeType }));
    if (autoResend) {
      // submitDraft 调用时读 store 真相（已是分叉线程）
      void workspaceActions.submitDraft(text, payloads);
      return;
    }
    uiStore.getState().restoreDraft(newThreadId, text);
    if (images.length > 0) {
      restoreComposerImages(images.map((image, index) => ({ name: copy.flow.forkedImageName(index + 1), payload: image })));
    }
    focusComposer();
  });
}

/** 编辑重发：替换当前草稿 + 聚焦。 */
export function editUserMessage(text: string): void {
  setDraftAndFocus(text);
}
