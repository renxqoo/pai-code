/**
 * transport 管线（T40 §2.3）：全仓唯一持有 host.request 的层。契约（审查处置 H1）：
 * - catch 显式返回 transient/host_unavailable——命令结果永不丢失；
 * - onCall 观测钩子独立隔离（观测者抛错只吞并保诊断注释，绝不影响命令结果）；
 * - 错误解码走 decodeApiError 全函数（永不抛）；
 * - 调用方不传超时——域方法内定档（timeouts.ts 单一真相）。
 */
import type { ApiError, HostCommandOutcome, PaiCommand } from '@paiapp/contracts';

import { decodeApiError, type HubResult } from './errors';

/** 传输注入形状（HostProcessPort.request 面——纯依赖，无进程/Electron 知识） */
export interface HubTransport {
  request(command: PaiCommand, timeoutMs?: number): Promise<HostCommandOutcome>;
}

export type Transport = <T>(command: PaiCommand, timeoutMs?: number) => Promise<HubResult<T>>;

/** 调用观测钩子：失败分支携带解码后的完整 ApiError（消费方自行取舍格式化，
 *  不在观测层折平 kind/face/code）。 */
export interface CallObserver {
  (command: PaiCommand, result: { ok: true } | { ok: false; error: ApiError }): void;
}

export function createTransport(deps: { request: HubTransport['request']; onCall?: CallObserver }): Transport {
  return async <T>(command: PaiCommand, timeoutMs?: number): Promise<HubResult<T>> => {
    let outcome: HostCommandOutcome;
    try {
      outcome = await deps.request(command, timeoutMs);
    } catch {
      const result = { ok: false as const, error: decodeApiError('host_unavailable') };
      observe(command, result);
      return result;
    }
    const result: HubResult<T> = outcome.ok
      ? { ok: true, data: outcome.data as T }
      : { ok: false, error: decodeApiError(outcome.error) };
    observe(command, result);
    return result;
  };

  function observe(command: PaiCommand, result: HubResult<unknown>): void {
    if (deps.onCall === undefined) return;
    try {
      deps.onCall(command, result.ok ? { ok: true } : { ok: false, error: result.error });
    } catch {
      // 观测者异常绝不影响命令结果（契约测试钉住）
    }
  }
}
