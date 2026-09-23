/**
 * 投递失败通知口径（自 workspace-actions 拆出——max-lines 500 纪律，纯移动）：
 * 宿主桥不可用不弹（横幅已显式呈现），恢复失败用专项文案。
 * 通道承载本地 token 与 hub error kind 字符串（W2 再定型为 ApiError） */
import { copyOfError } from '@/lib/error-text';
import { isTransientFace } from '@/strings/zh-error-copy';
import { copy } from '@/strings';

import { store } from './workspace-runtime';

function pushNotice(text: string): void {
  store.getState().pushNotice(text);
}

export function notifySubmitFailure(reason: string | null): void {
  if (reason === null || reason === 'bridge_unavailable') return;
  if (reason === 'resume_failed') {
    pushNotice(copy.flow.resumeFailed);
    return;
  }
  // 空舞台（无活跃会话）投递：给可行动去向，不透传 schema 密文
  if (reason === 'no_active_session') {
    pushNotice(copy.flow.noActiveSession);
    return;
  }
  // hub 能力门/量限的友好文案（细节原文对用户无行动价值；其余 kind 原样透传）
  if (reason === 'capability_images') {
    pushNotice(copy.flow.imagesDenied);
    return;
  }
  if (reason === 'images_too_many') {
    pushNotice(copy.flow.imagesTooMany);
    return;
  }
  // 直执行（`! `）携图互斥：主进程本地先拒的 kind（文案与 bashNoImages 同句）
  if (reason === 'bash_images_rejected') {
    pushNotice(copy.flow.bashNoImages);
    return;
  }
  // transient faces（宿主代际切换窗口/超时/忙/命令失败兜底）：按 face 出精准文案
  // （「宿主未就绪，请稍后重试」等），不走 sendFailed 原文透传。词表判定与
  // transientFaceCopy 同源（编译期闭集 Record 的键）——submitDraft 透传的 face
  // 恒属该词表，新增 face 自动带文案，不会漂移
  if (isTransientFace(reason)) {
    pushNotice(copyOfError({ kind: 'transient', face: reason }));
    return;
  }
  pushNotice(copy.flow.sendFailed(reason));
}
