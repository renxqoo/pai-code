import * as React from 'react';

import { copy } from '@/strings';
import type { PendingImage } from '@/composer/read-image-file';
import type { WorkspaceActions } from '@/live/workspace-actions';

/**
 * 分叉重发装配（B2/A5 的 fork→新会话→回填链）：fork 到该用户消息之前，
 * autoResend=true 原样重发（含图片），否则回填草稿与附件（图片经一次性
 * restore 信号并入 composer）。仅水化消息可分叉（live 回显是 UUID，对账后
 * 才有协议 entryId——判定在调用侧消息行）。
 */

type ForkMessageApi = {
  forkUserMessage: (entryId: string, text: string, images: ReadonlyArray<{ data: string; mimeType: string }>, autoResend: boolean) => void
  editUserMessage: (text: string) => void
  /** 排队消息编辑回填的一次性图片信号（token 自增；composer 按并入处理）。 */
  restore: { token: number; images: readonly { name: string; payload: PendingImage }[] } | null
  takeQueuedImages: (images: readonly { name: string; payload: PendingImage }[]) => void
}

type UseForkMessageArgs = {
  actions: WorkspaceActions
  /** 分叉出的新会话回填草稿槽（不得写旧会话键）。 */
  restoreDraft: (threadId: string, text: string) => void
  setDraft: (value: string) => void
  composerTextRef: React.RefObject<HTMLTextAreaElement | null>
}

export function useForkMessage({ actions, restoreDraft, setDraft, composerTextRef }: UseForkMessageArgs): ForkMessageApi {
  const [restore, setRestore] = React.useState<{ token: number; images: readonly { name: string; payload: PendingImage }[] } | null>(null);
  const restoreSeqRef = React.useRef(0);

  /** 图片回填的一次性信号（分叉回填与排队消息编辑共用）。 */
  const takeQueuedImages = React.useCallback((images: readonly { name: string; payload: PendingImage }[]): void => {
    restoreSeqRef.current += 1;
    setRestore({ token: restoreSeqRef.current, images });
  }, []);

  const forkUserMessage = React.useCallback(
    (entryId: string, text: string, images: ReadonlyArray<{ data: string; mimeType: string }>, autoResend: boolean): void => {
      void actions.forkFromEntry(entryId).then((newThreadId) => {
        if (newThreadId === null) return;
        const payloads = images.map((image) => ({ type: 'image' as const, data: image.data, mimeType: image.mimeType }));
        if (autoResend) {
          // submitDraft 调用时读 store 真相（已是分叉线程）
          void actions.submitDraft(text, payloads);
        } else {
          restoreDraft(newThreadId, text);
          if (images.length > 0) {
            takeQueuedImages(images.map((image, index) => ({ name: copy.flow.forkedImageName(index + 1), payload: image })));
          }
          composerTextRef.current?.focus();
        }
      });
    },
    [actions, restoreDraft, takeQueuedImages, composerTextRef],
  );

  const editUserMessage = React.useCallback(
    (text: string): void => {
      setDraft(text);
      composerTextRef.current?.focus();
    },
    [setDraft, composerTextRef],
  );

  return { forkUserMessage, editUserMessage, restore, takeQueuedImages };
}
