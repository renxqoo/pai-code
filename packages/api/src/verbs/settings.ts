

import type { ApiError, ApiMethod, ApiOutcome, ApiParams, PreferencesView, ProviderConfig, ProviderConfigView, SkillView } from '@paiapp/contracts';
import { isApiFormat, normalizeLegacyPermMode } from '@paiapp/contracts';
import { appError } from '../errors';
import type { SettingsCommands } from '../commands/settings';

import { envVarNameForProvider } from './env-name';
import { errorLogToken } from './error-log-token';
import { createProviderProbe } from './provider-probe';

/**
 * 设置与目录路由组（api-routes 的本地配置子集）：providers/技能目录/hub 设置/偏好写。
 * 技能清单与启停走 hub settings 域（skills/list、skills/set_enabled——hub 是
 * ~/.x-harness/skills 布局与 hub-settings skills.disabled 名单的单一写者）；
 * 视图构建器（providersView/preferencesView）随路由一并产出。
 */

type Handler<M extends ApiMethod> = (params: ApiParams<M>) => Promise<ApiOutcome<M>>;

/** 设置存储端口（verbs 消费面：providers CRUD + 偏好读写——provider 行用 contracts 真形） */
interface SettingsStorePort {
  listProviders(): ProviderConfig[];
  upsertProvider(input: unknown): ProviderConfig[];
  removeProvider(name: string): ProviderConfig[];
  get(): PreferencesView;
  patch(patch: Record<string, unknown>): unknown;
}
interface KeyStorePort { getKey(name: string): string | null; }

export type SettingsRoutesDeps = {
  settings: SettingsStorePort;
  keyStore: KeyStorePort;
  /** provider 配置变更后重启 host（providers.json 只在启动期读入）。 */
  restartHost: () => Promise<void>;
  /** hub settings 域 accessor（惰性：路由构造早于 runtime.start；host 未启动时各路由显式降级）。 */
  settingsCommands: () => SettingsCommands;
  /** 拒绝/失败落诊断日志（保存失败零日志曾致排障无据可查）。 */
  onReject?: (message: string) => void;
};

export function createSettingsRoutes(deps: SettingsRoutesDeps) {
  const failLogged = (error: ApiError): Promise<{ ok: false; error: ApiError }> => {
    deps.onReject?.(`provider_route_rejected:${errorLogToken(error)}`);
    return Promise.resolve({ ok: false, error });
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
    const result = await deps.settingsCommands().listSkills({});
    if (!result.ok) return [];
    const raw = (result.data as { skills?: unknown }).skills;
    if (!Array.isArray(raw)) return [];
    const out: SkillView[] = [];
    for (const item of raw) {
      if (typeof item !== 'object' || item === null) continue;
      const entry = item as Record<string, unknown>;
      const name = typeof entry['name'] === 'string' ? entry['name'] : '';
      if (name.length === 0) continue;
      const source = entry['source'] === 'project' ? 'project' : entry['source'] === 'user' ? 'user' : null;
      if (source === null) continue;
      out.push({ name, enabled: entry['disabled'] !== true, source });
    }
    return out;
  };

  // 连接探活（HTTP 直发不经 hub；渠道与 key 取本路由组的 settings/keyStore 端口，key 不进日志）
  const probe = createProviderProbe({
    getProvider: (name) => deps.settings.listProviders().find((provider) => provider.name === name),
    getKey: (name) => deps.keyStore.getKey(name),
  }).probe;

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
      const result = await deps.settingsCommands().setSkillEnabled({ name: params.name, enabled: params.enabled });
      if (!result.ok) return fail(result.error);
      return { ok: true as const, data: await skillsList() };
    },
    'provider/upsert': async (params) => {
      // env 变量名碰撞防护：不同名字 sanitize 后同名会导致 key 互串（a-b 与 a_b 同映射 PAI_KEY_A_B）
      const envName = envVarNameForProvider(params.name);
      const collides = deps.settings
        .listProviders()
        .some((provider) => provider.name !== params.name && envVarNameForProvider(provider.name) === envName);
      if (collides) return failLogged(appError('provider_name_conflict'));
      // api 词表校验（providers.json protocol 同源：词表外语形写盘会被目录剔除降级）
      if (!isApiFormat(params.api)) return failLogged(appError('provider_api_unsupported'));
      // baseUrl 形状校验（无 scheme 的档案被目录整档剔除且零告警——写前显式拒绝）
      if (!params.baseUrl.startsWith('http://') && !params.baseUrl.startsWith('https://')) {
        return failLogged(appError('provider_baseurl_invalid'));
      }
      // 同名内置预设 = 用户覆盖（x-harness 整档覆盖语义 + 消歧 custom 优先）：用户
      // 配置胜出、删渠道即恢复内置——不再拒名（T39 实施轮用户裁决：app 无「预设挡人」面）
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
      const outcome = await probe(params.name, params.modelId);
      return outcome.ok
        ? { ok: true as const, data: { latencyMs: outcome.latencyMs } }
        : fail(outcome.error);
    },
    'app/hubSettings': async () => {
      const result = await deps.settingsCommands().get({});
      if (!result.ok) return fail(result.error);
      const values = (result.data as { values?: Record<string, unknown> }).values ?? {};
      const mode = values['permission.defaultMode'];
      const thinking = values['thinking.default'];
      return {
        ok: true as const,
        data: {
          // 读侧归一：旧 4 档存量值（my-agent 期写入）收敛到 3 档（default/acceptEdits→auto、
          // fullAuto→full）——归一展示不丢语义；词表外语形视为未设置
          permissionDefaultMode: typeof mode === 'string' ? (normalizeLegacyPermMode(mode) ?? null) : null,
          thinkingDefault:
            thinking === 'off' || thinking === 'low' || thinking === 'medium' || thinking === 'high' || thinking === 'max'
              ? thinking
              : null,
        },
      };
    },
    'app/setHubSettings': async (params) => {
      // null = 不写该键（「未设置」在 hub 侧无协议表达——settings/set 无删除语义）
      if (params.permissionDefaultMode !== undefined && params.permissionDefaultMode !== null) {
        const result = await deps.settingsCommands().set({
          key: 'permission.defaultMode',
          value: params.permissionDefaultMode,
        });
        if (!result.ok) return fail(result.error);
      }
      if (params.thinkingDefault !== undefined && params.thinkingDefault !== null) {
        const result = await deps.settingsCommands().set({
          key: 'thinking.default',
          value: params.thinkingDefault,
        });
        if (!result.ok) return fail(result.error);
      }
      return { ok: true as const, data: null };
    },
    'app/setPreference': (params) => {
      const patch: Parameters<SettingsStorePort['patch']>[0] = {};
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

