/**
 * HubApi 门面（T40 §2/§2c）：全进程恰一个实例（pai-runtime buildHost 装配），
 * 消费方经注入拿域接口，不自己拼命令。零 class、freeze、纯依赖注入可裸测。
 * 其余命令域（session/models/permissions/agents/settings/host）随 T40 W2 落位。
 */
import { createThreadCommands, type ThreadCommands } from './commands/thread';
import { createTransport, type CallObserver, type HubTransport } from './transport';

export interface HubApi {
  readonly thread: ThreadCommands;
}

export function createHubApi(deps: { request: HubTransport['request']; onCall?: CallObserver }): HubApi {
  const send = createTransport({ request: deps.request, ...(deps.onCall !== undefined ? { onCall: deps.onCall } : {}) });
  return Object.freeze({
    thread: createThreadCommands(send),
  });
}

export { createTransport, type HubTransport, type Transport, type CallObserver } from './transport';
export { decodeApiError, appError, type ApiError, type HubError, type HubResult, type AppError, type AppErrorCode, type TransientError, type TransientFace, type UnregisteredCodeError } from './errors';
export { TIMEOUTS } from './timeouts';
