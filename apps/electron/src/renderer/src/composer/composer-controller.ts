import { queuedDrafts, type QueuedDraftImages } from '@/composer/queued-drafts';
import { store as liveStore } from '@/live/workspace-runtime';
import { uiStore } from '@/ui/ui-store';

/**
 * 输入卡跨区通道（模块单例，T33 U2）：textarea 注册/聚焦、图片回填一次性信号、
 * 草稿插入（palette 的斜杠命令追加）与替换（fork/编辑重发）、排队消息编辑回填。
 * 区域挂载时注册 textarea（对象 ref + effect——子件只认对象 ref，回调 ref 会废
 * 补全采纳后的光标定位）；palette/fork/排队编辑等跨区入口 import 即调。
 * 寻址一律读 live store 真相（调用时的活跃线程）。
 */

let textarea: HTMLTextAreaElement | null = null;

export function registerComposerTextarea(el: HTMLTextAreaElement): void {
  textarea = el;
}

export function unregisterComposerTextarea(el: HTMLTextAreaElement): void {
  if (textarea === el) textarea = null;
}

export function focusComposer(): void {
  textarea?.focus();
}

/** 图片回填一次性信号（token 递增；消费端 PromptCard 按并入处理，空数组并入零项）。 */
export function restoreComposerImages(images: QueuedDraftImages): void {
  uiStore.getState().setComposerRestore(images);
}

function currentDraft(threadId: string): string {
  const ui = uiStore.getState();
  return threadId.length === 0 ? ui.composerDraft : (ui.drafts[threadId] ?? ui.composerDraft);
}

/** 前缀拼接 + 聚焦（palette `/skill ` 插入链）：非空草稿去尾空白补一个空格再接。 */
export function insertIntoDraft(text: string): void {
  const threadId = liveStore.getState().activeThreadId ?? '';
  const current = currentDraft(threadId);
  const prefix = current.trim().length === 0 ? '' : `${current.replace(/\s+$/, '')} `;
  uiStore.getState().setDraft(threadId, `${prefix}${text}`);
  focusComposer();
}

/** 替换 + 聚焦（fork 回填/编辑重发链）。 */
export function setDraftAndFocus(text: string): void {
  const threadId = liveStore.getState().activeThreadId ?? '';
  uiStore.getState().setDraft(threadId, text);
  focusComposer();
}

/** 排队消息编辑：取出活跃线程的暂存条目回填草稿与附件信号 + 聚焦。 */
export function editQueuedDraft(id: number): void {
  const threadId = liveStore.getState().activeThreadId ?? '';
  const draft = queuedDrafts.take(threadId, id);
  if (draft === null) return;
  setDraftAndFocus(draft.text);
  restoreComposerImages(draft.images);
}
