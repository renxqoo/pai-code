import type { ApiError } from '@paiapp/contracts';

/**
 * ApiError → 展示文本（T40 W1 过渡形态，W2 换 kind 查表文案）：
 * `${kind}：${message}`；transient 显示 face（face 是瞬态失败的可读面孔——
 * kind 恒为 'transient' 无区分度）；unregistered_code 显示 code（未登记码
 * 原文不丢——kind 本身无信息量）；message 缺席只显 kind/face/code。
 */

export function errorText(error: ApiError): string {
  if (error.kind === 'transient') {
    return error.message === undefined ? error.face : `${error.face}：${error.message}`;
  }
  if (error.kind === 'unregistered_code') {
    return error.message.length === 0 ? error.code : `${error.code}：${error.message}`;
  }
  return error.message === undefined ? error.kind : `${error.kind}：${error.message}`;
}
