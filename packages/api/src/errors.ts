/**
 * ApiError 判别联合与全函数解码（T40 §2.2/§2.3）：
 * - hub 对象错误按码表映射 kind（一一对应）；未登记 code → unregistered_code 兜底族，
 *   code+message 原文透传不丢（弱形态禁令）。
 * - infra 自产串（timeout/busy/host_* 等）→ transient 族；串全集对照见
 *   infra/host-process（对照断言钉住）。
 * - AppError = app 本地闭集（路由/渲染层自产失败），与协议词表互不污染。
 * decodeApiError 永不抛（任意输入落可呈现形态）。
 */
import { HUB_ERROR_CODES, type ApiError, type AppError, type AppErrorCode, type HubErrorCode, type HubErrorShape, type TransientFace } from '@paiapp/contracts';

export type { ApiError, AppError, AppErrorCode, HubError, TransientError, TransientFace, UnregisteredCodeError } from '@paiapp/contracts';

export type HubResult<T> = { ok: true; data: T } | { ok: false; error: ApiError };

const TRANSIENT_FACES: Readonly<Record<string, TransientFace>> = {
  busy: 'busy',
  timeout: 'timeout',
  host_unavailable: 'host_unavailable',
  host_restarting: 'host_restarting',
  host_failed: 'host_failed',
  host_not_running: 'host_not_running',
  host_disposed: 'host_disposed',
  write_failed: 'write_failed',
  command_failed: 'command_failed',
  bridge_unavailable: 'bridge_unavailable',
};

const CODE_SET: ReadonlySet<string> = new Set(HUB_ERROR_CODES);

/** app 本地失败铸造（路由/渲染层 fail 面） */
export function appError(kind: AppErrorCode, message?: string): AppError {
  return message === undefined ? { kind } : { kind, message };
}

/** 全函数解码：hub 对象 → 码表/兜底；infra 串 → transient（未面孔保留原文）；垃圾 → command_failed */
export function decodeApiError(error: string | HubErrorShape | undefined): ApiError {
  if (typeof error === 'object' && error !== null) {
    const record = error as unknown as Record<string, unknown>;
    if (typeof record['code'] === 'string' && typeof record['message'] === 'string') {
      const code = record['code'];
      const message = record['message'];
      return CODE_SET.has(code) ? { kind: code as HubErrorCode, message } : { kind: 'unregistered_code', code, message };
    }
    return { kind: 'transient', face: 'command_failed', message: 'malformed error payload' };
  }
  const text = typeof error === 'string' ? error : 'command_failed';
  const face = TRANSIENT_FACES[text];
  return face === undefined ? { kind: 'transient', face: 'command_failed', message: text } : { kind: 'transient', face };
}
