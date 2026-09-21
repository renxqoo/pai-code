import type { ApiError } from '@paiapp/contracts';

import { copy } from '@/strings';

/**
 * ApiError → 展示文案（W2 查表收口）：errorCopy 按 kind 分派，键集 = ApiErrorKind
 * 全集（Record 编译期封闭——新增 kind 不加键不编译）；transient 按 face 细分、
 * unregistered_code 原文透传均为表内函数值。locale 随 copy 代理按当前语言解析。
 * 运行时垃圾 kind（仅 IPC 形状腐坏可达）兜底降级，不渲染空。
 */
export function copyOfError(error: ApiError): string {
  const entry = copy.errorCopy[error.kind as ApiError['kind']];
  if (entry === undefined) return `${String(error.kind)}${'message' in error && error.message !== undefined ? `：${error.message}` : ''}`;
  return typeof entry === 'function' ? entry(error) : entry;
}
