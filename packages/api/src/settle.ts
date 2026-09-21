/**
 * settle：HubResult → ApiOutcome 的单点折叠（T40 §2c 形态①的支撑原语）。
 * 全仓唯一一处做此折叠——纯转发路由经 relay 一行挂载，带业务路由在失败出口调用。
 */
import type { ApiError } from '@paiapp/contracts';

import type { HubResult } from './errors';

export function settle<T>(result: HubResult<T>): { ok: true; data: T } | { ok: false; error: ApiError } {
  return result.ok ? { ok: true, data: result.data } : { ok: false, error: result.error };
}
