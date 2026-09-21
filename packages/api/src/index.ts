/**
 * HubApi 门面（T40 §2/§2c）：全进程恰一个实例（pai-runtime buildHost 装配），
 * 消费方经注入拿域接口，不自己拼命令。零 class、freeze、纯依赖注入可裸测。
 * 七域齐备（thread/session/models/permissions/agents/settings/host）；收窄视图
 * 并入（views/）随 W3 落位。
 */
import { createAgentCommands, type AgentCommands } from './commands/agents';
import { createHostCommands, type HostCommands } from './commands/host';
import { createModelCommands, type ModelCommands } from './commands/models';
import { createPermissionCommands, type PermissionCommands } from './commands/permissions';
import { createSessionCommands, type SessionCommands } from './commands/session';
import { createSettingsCommands, type SettingsCommands } from './commands/settings';
import { createThreadCommands, type ThreadCommands } from './commands/thread';
import { createTransport, type CallObserver, type HubTransport } from './transport';

export interface HubApi {
  readonly thread: ThreadCommands;
  readonly session: SessionCommands;
  readonly models: ModelCommands;
  readonly permissions: PermissionCommands;
  readonly agents: AgentCommands;
  readonly settings: SettingsCommands;
  readonly host: HostCommands;
}

export function createHubApi(deps: { request: HubTransport['request']; onCall?: CallObserver }): HubApi {
  const send = createTransport({ request: deps.request, ...(deps.onCall !== undefined ? { onCall: deps.onCall } : {}) });
  return Object.freeze({
    thread: createThreadCommands(send),
    session: createSessionCommands(send),
    models: createModelCommands(send),
    permissions: createPermissionCommands(send),
    agents: createAgentCommands(send),
    settings: createSettingsCommands(send),
    host: createHostCommands(send),
  });
}

export { createTransport, type HubTransport, type Transport, type CallObserver } from './transport';
export { decodeApiError, appError, type ApiError, type HubError, type HubResult, type AppError, type AppErrorCode, type TransientError, type TransientFace, type UnregisteredCodeError } from './errors';
export { settle } from './settle';
export { TIMEOUTS } from './timeouts';
export type { ThreadCommands } from './commands/thread';
export type { SessionCommands } from './commands/session';
export type { ModelCommands } from './commands/models';
export type { PermissionCommands } from './commands/permissions';
export type { AgentCommands } from './commands/agents';
export type { SettingsCommands } from './commands/settings';
export type { HostCommands } from './commands/host';
