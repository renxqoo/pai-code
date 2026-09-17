import type { ApiMethod, ApiOutcome, ApiParams, ProviderConfigView, SkillView } from '@paiapp/contracts';
import { isApiFormat } from '@paiapp/contracts';

import { HUB_API_FORMATS, envVarNameForProvider } from './models-config';
import { createProviderProbe } from './provider-probe';
import type { createFileSettings, ProviderKeyStore } from './file-settings';

/**
 * 设置与目录路由组（api-routes 的本地配置子集）：providers/技能目录/hub 设置/偏好写。
 * 技能清单与启停走 hub 命令（skills/list、skills/set_enabled——hub 是
 * ~/.my-agent/skills 布局与 hub-settings skills.disabled 名单的单一写者）；
 * 视图构建器（providersView/preferencesView）随路由一并产出。
 */

type Handler<M extends ApiMethod> = (params: ApiParams<M>) => Promise<ApiOutcome<M>>;

type FileSettings = ReturnType<typeof createFileSettings>;

export type SettingsCommand = (
  cmd:
    | { type: 'skills/list' }
    | { type: 'skills/set_enabled'; name: string; enabled: boolean }
    | { type: 'settings/get' }
    | { type: 'settings/set'; key: string; value: unknown }
    | { type: 'get_models' },
) => Promise<{ ok: true; data: unknown } | { ok: false; reason: string }>;

export type SettingsRoutesDeps = {
  settings: FileSettings;
  keyStore: ProviderKeyStore;
  /** provider 配置变更后重启 host（models.json 只在启动期读入）。 */
  restartHost: () => Promise<void>;
  /** hub 命令通道（技能/设置/模型目录命令；host 未启动时各路由显式降级）。 */
  command: SettingsCommand;
  /** 拒绝/失败落诊断日志（保存失败零日志曾致排障无据可查）。 */
  onReject?: (message: string) => void;
};

export function createSettingsRoutes(deps: SettingsRoutesDeps) {
  const failLogged = (reason: string): Promise<{ ok: false; reason: string }> => {
    deps.onReject?.(`provider_route_rejected:${reason}`);
    return Promise.resolve({ ok: false, reason });
  };
  const fail = failLogged;

  const providersView = (): ProviderConfigView[] =>
    deps.settings.listProviders().map((provider) => ({
      name: provider.name,
      baseUrl: provider.baseUrl,
      api: provider.api,
      models: provider.models.map((model) => ({ ...model })),
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
      idleRecycleMinutes: settings.idleRecycleMinutes,
    };
  };

  /** 技能清单（hub skills/list 收窄；host 未启动降级空表）。 */
  const skillsList = async (): Promise<SkillView[]> => {
    const result = await deps.command({ type: 'skills/list' }).catch(() => null);
    if (result === null || !result.ok) return [];
    const raw = (result.data as { skills?: unknown }).skills;
    if (!Array.isArray(raw)) return [];
    const out: SkillView[] = [];
    for (const item of raw) {
      if (typeof item !== 'object' || item === null) continue;
      const entry = item as Record<string, unknown>;
      const name = typeof entry['name'] === 'string' ? entry['name'] : '';
      if (name.length === 0) continue;
      const source =
        entry['source'] === 'skill-builtin' ? 'builtin' : entry['source'] === 'skill-project' ? 'project' : entry['source'] === 'skill-user' ? 'user' : null;
      if (source === null) continue;
      out.push({ name, enabled: entry['disabled'] !== true, source });
    }
    return out;
  };

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
    'app/hubSettings': Handler<'app/hubSettings'>;
    'app/setHubSettings': Handler<'app/setHubSettings'>;
    'app/setPreference': Handler<'app/setPreference'>;
  } = {
    'skills/list': async () => ({ ok: true as const, data: await skillsList() }),
    'skills/setEnabled': async (params) => {
      const result = await deps.command({ type: 'skills/set_enabled', name: params.name, enabled: params.enabled });
      if (!result.ok) return fail(result.reason);
      return { ok: true as const, data: await skillsList() };
    },
    'provider/upsert': async (params) => {
      // env 变量名碰撞防护：不同名字 sanitize 后同名会导致 key 互串（a-b 与 a_b 同映射 PAI_KEY_A_B）
      const envName = envVarNameForProvider(params.name);
      const collides = deps.settings
        .listProviders()
        .some((provider) => provider.name !== params.name && envVarNameForProvider(provider.name) === envName);
      if (collides) return failLogged('provider_name_conflict');
      // api 词表校验（host-hub models/add 同源：词表外格式写盘会被目录降级剔除）
      if (!isApiFormat(params.api)) return failLogged('provider_api_unsupported');
      // 撞 hub 预设键：custom 条目 provider 撞预设键会被 host-hub readCatalog 静默剔除
      // （渠道消失 + 目录降级仅预设）——写前显式拒绝；host 未启动时目录不可得，
      // 保守拒绝（落盘即静默失效比拒绝对用户更糟）
      const modelsResult = await deps.command({ type: 'get_models' });
      if (!modelsResult.ok) return failLogged(`host_unavailable:${modelsResult.reason}`);
      const presetKeys = new Set(
        (Array.isArray(modelsResult.data) ? modelsResult.data : [])
          .filter((entry) => typeof entry === 'object' && entry !== null && (entry as Record<string, unknown>)['source'] === 'preset')
          .map((entry) => (entry as Record<string, unknown>)['provider'])
          .filter((value): value is string => typeof value === 'string'),
      );
      if (presetKeys.has(params.name)) return failLogged(`provider_name_conflicts_preset:${params.name}`);
      deps.settings.upsertProvider({
        name: params.name,
        baseUrl: params.baseUrl,
        api: params.api,
        models: params.models.map((model) => ({ ...model })),
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
    'app/hubSettings': async () => {
      const result = await deps.command({ type: 'settings/get' });
      if (!result.ok) return fail(result.reason);
      const values = (result.data as { values?: Record<string, unknown> }).values ?? {};
      const mode = values['permission.defaultMode'];
      const thinking = values['thinking.default'];
      return {
        ok: true as const,
        data: {
          permissionDefaultMode:
            mode === 'plan' || mode === 'default' || mode === 'acceptEdits' || mode === 'fullAuto' ? mode : null,
          thinkingDefault:
            thinking === 'off' || thinking === 'low' || thinking === 'medium' || thinking === 'high' ? thinking : null,
        },
      };
    },
    'app/setHubSettings': async (params) => {
      // null = 不写该键（「未设置」在 hub 侧无协议表达——settings/set 无删除语义）
      if (params.permissionDefaultMode !== undefined && params.permissionDefaultMode !== null) {
        const result = await deps.command({
          type: 'settings/set',
          key: 'permission.defaultMode',
          value: params.permissionDefaultMode,
        });
        if (!result.ok) return fail(result.reason);
      }
      if (params.thinkingDefault !== undefined && params.thinkingDefault !== null) {
        const result = await deps.command({
          type: 'settings/set',
          key: 'thinking.default',
          value: params.thinkingDefault,
        });
        if (!result.ok) return fail(result.reason);
      }
      return { ok: true as const, data: null };
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
    skillsList,
    routes,
  };
}

export { HUB_API_FORMATS };
