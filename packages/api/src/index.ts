/**
 * HubApi 门面（T40 §2/§2c）：全进程恰一个实例（pai-runtime buildHost 装配），
 * 消费方经注入拿域接口，不自己拼命令。零 class、freeze、纯依赖注入可裸测。
 * 七域齐备（thread/session/models/permissions/agents/settings/host）；帧解码/
 * 命令编码/事件映射（events/）与协议响应收窄视图（views/）由本包统一导出。
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
export { sessionRoutes, bashRouteHandler } from './verbs/session';
export { appRoutes } from './verbs/app';
export { threadOpsRoutes } from './verbs/thread-ops';
export { promptRoutes } from './verbs/prompt';
export { resumeRoutes } from './verbs/resume';
export { runtimeRoutes } from './verbs/runtime';
export { createLocalRoutes, type LocalRoutesDeps } from './verbs/local';
export { createSettingsRoutes } from './verbs/settings';
export { createSkillRoutes, failClosedSkillSources, type SkillRoutesDeps, type SkillSourcePort } from './verbs/skills';
export {
  combineCandidate,
  discoverSkillDirs,
  isInstallableSkillName,
  isPathInside,
  mapSkillInspectError,
  mapSkillInstallError,
  planImport,
  skillProblemKind,
  type ImportPlan,
  type ScanDirent,
  type ScanFs,
} from './verbs/skills-import';
export { createSkillInstallPort, type SkillInstallPort } from './verbs/skill-install-port';
export { compactInvocationOf, interceptsCompact } from './verbs/compact-lexing';
export { errorLogToken } from './verbs/error-log-token';
export { slowCallTrace } from './verbs/slow-call-trace';
export { envVarNameForProvider } from './verbs/env-name';
export { autoTitleCandidateOf } from './verbs/auto-title';
export { createGitBranches, classifyGitExecError, type GitBranches, type GitExec, type GitExecResult, type GitExecError } from './verbs/git-branches';
export { createGitGraph, type GitGraph } from './verbs/git-graph';
export { createGitStatus, type GitStatus, type GitStatusOutcome } from './verbs/git-status';
export {
  parseAgentDefinition,
  serializeAgentDefinition,
  isSafeFileNameStem,
  fileNameStemOf,
  type AgentDefinitionFile,
} from './verbs/agent-definition';
export { serializeProvidersConfig } from './verbs/providers-config';
export type { RuntimePort, MonitorPort, AgentDefinitionsPort, AuditPort, FailPort } from './verbs/ports';
export { createApiClient, type ApiClient, type ApiClientTransport } from './client';
export { TIMEOUTS } from './timeouts';
export type { ThreadCommands } from './commands/thread';
export type { SessionCommands } from './commands/session';
export type { ModelCommands } from './commands/models';
export type { PermissionCommands } from './commands/permissions';
export type { AgentCommands } from './commands/agents';
export type { SettingsCommands } from './commands/settings';
export type { HostCommands } from './commands/host';

export { createFrameDecoder, classifyFrame, type FrameDecoder, type FrameDecoderOptions } from './events/frame-decoder';
export { encodeCommand } from './events/command-encoder';
export { createEventMapper, payloadSessionOf, type EventMapDeps, type EventMapper } from './events/event-mapper';
export { mapDialogRequest } from './views/dialog-mapper';
export { mapEntries } from './views/entries-mapper';
export {
  toSessionView,
  threadStateView,
  thinkingLevelView,
  savedSessions,
  modelInfos,
  sessionStatsView,
  sessionCommands,
  previewCommands,
  hostInfoView,
  threadListRows,
  inflightView,
  subagentSnapshotView,
  pendingDialogsView,
  type SessionViewInput,
} from './views/response-views';
export { diffFromWriteArgs } from './views/diff-extract';
export { flattenUserText, assistantText, assistantThinking } from './views/content';
export { parseDiagnosticEvent } from './views/diagnostic-events';
export { createPluginRoutes, mapPluginError, pluginRowsOf, type PluginRoutesDeps } from './verbs/plugins';
export { failClosedPluginSources, type PluginSourcePort } from './verbs/plugin-source';
