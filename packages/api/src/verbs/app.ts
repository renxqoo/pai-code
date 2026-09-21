import type { AgentDefinitionsPort, RuntimePort } from './ports';

import type { ApiError, ApiMethod, ApiOutcome, ApiParams } from '@paiapp/contracts';
import { appError } from '../errors';
import { settle } from '../settle';
import { modelInfos, previewCommands, sessionCommands, type savedSessions } from '../views/response-views';
import type { AgentCommands } from '../commands/agents';
import type { ModelCommands } from '../commands/models';
import type { SessionCommands } from '../commands/session';
import type { HubApi } from '../index';

import type { ModelInfoView, PreferencesView, ProviderConfigView, SkillView } from '@paiapp/contracts';


type Handler<M extends ApiMethod> = (params: ApiParams<M>) => Promise<ApiOutcome<M>>;
type Fail = (error: ApiError) => { ok: false; error: ApiError };

/**
 * app 域路由组（bootstrap 聚合/restartHost/dialog 应答与选择器/command 目录与预构/
 * agent 定义管理面 + 纯转发 steer）。bootstrap 先冲缓冲再开门的时序约束在此。
 */
export function appRoutes(deps: {
  hub: () => HubApi;
  modelCommands: () => ModelCommands;
  sessionCommands: () => SessionCommands;
  agentCommands: () => AgentCommands;
  fail: Fail;
  runtime: RuntimePort;
  audit: (message: string) => void;
  pickDirectory: (defaultPath: string | null) => Promise<string | null>;
  agentDefinitions: AgentDefinitionsPort;
  knownCwds: () => string[];
  savedAcrossCwds: (cwd?: string) => Promise<ReturnType<typeof savedSessions>>;
  channelModels: (models: readonly ModelInfoView[]) => ModelInfoView[];
  providersView: () => ProviderConfigView[];
  preferencesView: () => PreferencesView;
  skillsList: () => Promise<SkillView[]>;
}): {
  'app/bootstrap': Handler<'app/bootstrap'>;
  'app/restartHost': Handler<'app/restartHost'>;
  'dialog/respond': Handler<'dialog/respond'>;
  'dialog/pickDirectory': Handler<'dialog/pickDirectory'>;
  'command/list': Handler<'command/list'>;
  'command/preview': Handler<'command/preview'>;
  'agent/definitions': Handler<'agent/definitions'>;
  'subagent/steer': Handler<'subagent/steer'>;
} {
  const { fail, runtime } = deps;
  /** 纯转发组合器（本组形态）：params 形状 ≡ hub 入参，类型不合写不出 relay */
  const relay = <I, T>(pick: (api: HubApi) => (input: I) => Promise<{ ok: true; data: T } | { ok: false; error: ApiError }>) =>
    async (params: I) => settle(await pick(deps.hub())(params));
  return {
    'app/bootstrap': async () => {
      const [saved, models] = await Promise.all([deps.savedAcrossCwds(), deps.modelCommands().getModels()]);
      const outcome = {
        sessions: runtime.sessions(),
        saved,
        models: models.ok ? deps.channelModels(modelInfos(models.data)) : [],
        providers: deps.providersView(),
        preferences: deps.preferencesView(),
        hostPhase: runtime.hostPhase(),
      };
      // 先冲缓冲再开门：开门后新事件直发，若先开门，await 窗口内的新事件会
      // 插队到更旧的缓冲事件之前（sessionUpdated 旧覆新）
      runtime.emitBuffered();
      runtime.markBootstrapped();
      return { ok: true as const, data: outcome };
    },
    'app/restartHost': () => {
      deps.audit('restart_host:manual');
      if (runtime.hostPhase() === null) return Promise.resolve(fail({ kind: 'transient', face: 'host_unavailable' }));
      void runtime.host.restart('manual').catch(() => undefined);
      return Promise.resolve({ ok: true as const, data: null });
    },
    'dialog/respond': async (params) => {
      // 任何情况下都必答（晚到/未知 id 由 host 静默忽略并 ack）；权限应答落审计日志
      const confirmed = params.payload['confirmed'] === true;
      const cancelled = params.payload['cancelled'] === true;
      deps.audit(`dialog_respond:${params.requestId}:${cancelled ? 'cancelled' : confirmed ? 'confirmed' : 'value'}`);
      const result = await deps.agentCommands().respondDialog({ requestId: params.requestId, payload: params.payload });
      return result.ok ? { ok: true as const, data: null } : fail(result.error);
    },
    'dialog/pickDirectory': (params) =>
      deps
        .pickDirectory(params.defaultPath ?? null)
        .then((directory) => ({ ok: true as const, data: directory }))
        .catch(() => fail(appError('dialog_unavailable'))),
    'command/list': async (params) => {
      const result = await deps.sessionCommands().getCommands({ threadId: params.threadId });
      return result.ok ? { ok: true as const, data: sessionCommands(result.data) } : fail(result.error);
    },
    'command/preview': async () => {
      const enabled = (await deps.skillsList()).filter((skill) => skill.enabled);
      return { ok: true as const, data: previewCommands(enabled) };
    },
    'agent/definitions': () => {
      // 管理面走主进程文件面（不经 hub：需要 systemPrompt 原文与全部已知项目的定义）
      return Promise.resolve({ ok: true as const, data: deps.agentDefinitions.list(deps.knownCwds()) });
    },
    'subagent/steer': relay((api) => (input) => api.agents.steer(input)),
  };
}
