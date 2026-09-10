import type { ApiMethod, ApiOutcome, ApiParams, ProviderConfigView } from '@paiapp/contracts';

import { envVarNameForProvider } from './models-config';
import { createProviderProbe } from './provider-probe';
import { createSkillsCatalog } from './skills-catalog';
import type { AgentDirFiles } from './agent-dir-files';
import type { createFileSettings, ProviderKeyStore } from './file-settings';

/**
 * 设置与目录路由组（api-routes 的本地配置子集）：providers/技能目录/偏好写。
 * 视图构建器（providersView/preferencesView）与技能目录随路由一并产出——
 * bootstrap 与 command/preview 在主表侧复用同一实例。
 */

type Handler<M extends ApiMethod> = (params: ApiParams<M>) => Promise<ApiOutcome<M>>;

type FileSettings = ReturnType<typeof createFileSettings>;

export type SettingsRoutesDeps = {
  settings: FileSettings;
  keyStore: ProviderKeyStore;
  agentDir: string;
  agentDirFiles: AgentDirFiles;
  /** 用户级技能目录源（测试注入替身）。 */
  skillSources?: () => ReadonlyArray<{ origin: 'agent' | 'agents'; dir: string }>;
  /** provider 配置变更后重启 host（env 注入的 key 只在启动时读入）。 */
  restartHost: () => Promise<void>;
};

export function createSettingsRoutes(deps: SettingsRoutesDeps) {
  const fail = (reason: string): Promise<{ ok: false; reason: string }> => Promise.resolve({ ok: false, reason });

  const providersView = (): ProviderConfigView[] =>
    deps.settings.listProviders().map((provider) => ({
      name: provider.name,
      baseUrl: provider.baseUrl,
      api: provider.api,
      models: provider.models.map((model) => ({ ...model })),
      thinkingFormat: provider.thinkingFormat,
      hasKey: deps.keyStore.getKey(provider.name) !== null,
    }));

  const preferencesView = () => {
    const settings = deps.settings.get();
    return {
      defaultModel: settings.defaultModel,
      onboarded: settings.onboarded,
      projectModels: { ...settings.projectModels },
      pinnedSessions: [...settings.pinnedSessions],
      trustedDefault: settings.trustedDefault,
      hiddenProjects: [...settings.hiddenProjects],
      archivedSessions: [...settings.archivedSessions],
    };
  };

  /** 用户级技能目录装配（清单/启停/预构命令目录；测试可注入目录源替身）。 */
  const skills = createSkillsCatalog({
    agentDir: deps.agentDir,
    agentDirFiles: deps.agentDirFiles,
    skillSources: deps.skillSources,
  });

  /** 连接探活（主进程直发，不经 hub；key 不进日志）。 */
  const probe = createProviderProbe({
    getProvider: (name) => deps.settings.listProviders().find((provider) => provider.name === name),
    getKey: (name) => deps.keyStore.getKey(name),
  });

  const routes: {
    'skills/list': Handler<'skills/list'>;
    'skills/setEnabled': Handler<'skills/setEnabled'>;
    'provider/upsert': Handler<'provider/upsert'>;
    'provider/remove': Handler<'provider/remove'>;
    'provider/test': Handler<'provider/test'>;
    'app/setPreference': Handler<'app/setPreference'>;
  } = {
    'skills/list': () => Promise.resolve({ ok: true as const, data: skills.list() }),
    'skills/setEnabled': (params) => {
      const error = skills.setEnabled(params.name, params.enabled);
      return error === null ? Promise.resolve({ ok: true as const, data: skills.list() }) : fail(error);
    },
    'provider/upsert': async (params) => {
      // env 变量名碰撞防护：不同名字 sanitize 后同名会导致 key 互串（a-b 与 a_b 同映射 PAI_KEY_A_B）
      const envName = envVarNameForProvider(params.name);
      const collides = deps.settings
        .listProviders()
        .some((provider) => provider.name !== params.name && envVarNameForProvider(provider.name) === envName);
      if (collides) return fail('provider_name_conflict');
      deps.settings.upsertProvider({
        name: params.name,
        baseUrl: params.baseUrl,
        api: params.api,
        models: params.models.map((model) => ({ ...model })),
        thinkingFormat: params.thinkingFormat ?? 'default',
        apiKey: params.apiKey,
      });
      await deps.restartHost();
      return { ok: true as const, data: providersView() };
    },
    'provider/remove': async (params) => {
      deps.settings.removeProvider(params.name);
      await deps.restartHost();
      return { ok: true as const, data: providersView() };
    },
    'provider/test': async (params) => {
      const outcome = await probe.probe(params.name, params.modelId);
      return outcome.ok
        ? { ok: true as const, data: { latencyMs: outcome.latencyMs } }
        : fail(outcome.reason);
    },
    'app/setPreference': (params) => {
      const patch: Parameters<FileSettings['patch']>[0] = {};
      if (params.defaultModel !== undefined) patch.defaultModel = params.defaultModel;
      if (params.onboarded !== undefined) patch.onboarded = params.onboarded;
      if (params.projectModels !== undefined) patch.projectModels = { ...params.projectModels };
      if (params.pinnedSessions !== undefined) patch.pinnedSessions = [...params.pinnedSessions];
      if (params.trustedDefault !== undefined) patch.trustedDefault = params.trustedDefault;
      if (params.hiddenProjects !== undefined) patch.hiddenProjects = [...params.hiddenProjects];
      if (params.archivedSessions !== undefined) patch.archivedSessions = [...params.archivedSessions];
      deps.settings.patch(patch);
      return Promise.resolve({ ok: true as const, data: preferencesView() });
    },
  };

  return {
    providersView,
    preferencesView,
    skills,
    routes,
  };
}
