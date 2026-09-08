import { realpathSync } from 'node:fs';
import { basename as baseName, dirname as dirnamePath, join as joinPaths, resolve as resolvePath, sep as pathSep } from 'node:path';

import { mapEntries, modelInfos, savedSessions, sessionCommands, sessionStatsView, threadStateView, thinkingLevels } from '@paiapp/adapter';
import { envVarNameForProvider } from './models-config';
import { createProviderProbe } from './provider-probe';
import type { AgentDirFiles } from './agent-dir-files';
import { defaultPermissionRules, PermissionRulesSchema } from '@paiapp/contracts';
import { ApiSchemas, type ApiMethod, type ApiOutcome, type ApiParams } from '@paiapp/contracts';

import type { PaiRuntime } from './pai-runtime';
import type { createFileSettings } from './file-settings';
import type { ProviderKeyStore } from './file-settings';

/**
 * 渲染层 invoke 路由：zod 校验 → 翻译为 pai-cli 命令 → 响应收窄为视图。
 * 全部错误以 {ok:false,reason} 返回（中性英文）；协议字面量只在本文件与 adapter 出现。
 */

type FileSettings = ReturnType<typeof createFileSettings>;

export interface ApiRouteDeps {
  runtime: PaiRuntime;
  settings: FileSettings;
  keyStore: ProviderKeyStore;
  /** 审计日志（权限应答等安全敏感动作）。 */
  audit: (message: string) => void;
  /** agentDir 受控文件面（固定文件名白名单，原子写）。 */
  agentDirFiles: AgentDirFiles;
}

type Outcome<M extends ApiMethod> = Promise<ApiOutcome<M>>;

export function createApiRoutes(deps: ApiRouteDeps) {
  const { runtime } = deps;

  const fail = (reason: string): { ok: false; reason: string } => ({ ok: false, reason });

  /** 会话文件白名单：resolve 后必须位于 sessionsRoot 之下（真实路径优先，缺文件回退 resolve）。 */
  const insideSessionsRoot = (sessionPath: string): boolean => {
    let root = runtime.sessionsRoot;
    try {
      root = realpathSync(root);
    } catch {
      // 目录不存在时 resolve 语义兜底
    }
    let target = resolvePath(sessionPath);
    try {
      target = realpathSync(target);
    } catch {
      // 目标文件尚不存在：按已存在的父目录归一（macOS /tmp→/private/tmp 符号链接），
      // 前缀拦截仍生效；文件缺失的报错交给 host
      try {
        target = joinPaths(realpathSync(dirnamePath(target)), baseName(target));
      } catch {
        // 父目录也不存在：保持 resolve 形态（多半已在白名单外）
      }
    }
    return target === root || target.startsWith(`${root}${pathSep}`);
  };

  const command = async (cmd: Parameters<PaiRuntime['host']['request']>[0]): Promise<{ ok: true; data: unknown } | { ok: false; reason: string }> => {
    try {
      const outcome = await runtime.host.request(cmd);
      return outcome.ok ? { ok: true, data: outcome.data } : fail(outcome.error);
    } catch {
      // host 未启动/装配失败走 outcome 而非异常（渲染层据此进降级 UI）
      return fail('host_unavailable');
    }
  };

  /** 已知工作目录集合：活跃会话 + 注册表（list_saved 按目录过滤，需逐目录聚合）。 */
  const knownCwds = (): string[] => {
    const cwds = new Set<string>(runtime.sessions().map((session) => session.cwd));
    for (const row of runtime.registry.list()) {
      if (row.cwd.length > 0) cwds.add(row.cwd);
    }
    return [...cwds];
  };

  const savedAcrossCwds = async (cwd?: string): Promise<ReturnType<typeof savedSessions>> => {
    const targets = cwd !== undefined ? [cwd] : knownCwds();
    const merged = new Map<string, ReturnType<typeof savedSessions>[number]>();
    for (const target of targets) {
      const result = await command({ type: 'thread/list_saved', cwd: target });
      if (!result.ok) continue;
      for (const session of savedSessions(result.data)) merged.set(session.sessionPath, session);
    }
    return [...merged.values()].sort((a, b) => b.modifiedAt - a.modifiedAt);
  };

  const providersView = (): Array<{ name: string; baseUrl: string; api: string; models: string[]; hasKey: boolean }> =>
    deps.settings.listProviders().map((provider) => ({
      name: provider.name,
      baseUrl: provider.baseUrl,
      api: provider.api,
      models: [...provider.models],
      hasKey: deps.keyStore.getKey(provider.name) !== null,
    }));

  const preferencesView = (): { defaultModel: string | null; onboarded: boolean } => {
    const settings = deps.settings.get();
    return { defaultModel: settings.defaultModel, onboarded: settings.onboarded };
  };

  /** 连接探活（主进程直发，不经 hub；key 不进日志）。 */
  const probe = createProviderProbe({
    getProvider: (name) => deps.settings.listProviders().find((provider) => provider.name === name),
    getKey: (name) => deps.keyStore.getKey(name),
  });

  /** provider 配置变更：重生成 models.json；若 host 未热加载则重启恢复链路（host 未启动则待下次启动生效）。 */
  const applyProviderChange = async (): Promise<void> => {
    const providers = deps.settings.listProviders();
    try {
      const models = await runtime.host.request({ type: 'get_models' });
      if (models.ok) {
        const known = new Set(modelInfos(models.data).map((model) => model.provider));
        const missing = providers.some((provider) => !known.has(provider.name));
        if (!missing) return;
      }
      await runtime.host.restart('providers_changed');
    } catch {
      // host 未启动/未配置：配置已落盘，下次启动时 buildEnv 重生成生效
    }
  };

  type RouteTable = { [M in ApiMethod]: (params: ApiParams<M>) => Outcome<M> };

  const routes: RouteTable = {
    'app/bootstrap': async () => {
      runtime.markBootstrapped();
      const [saved, models] = await Promise.all([savedAcrossCwds(), command({ type: 'get_models' })]);
      const outcome = {
        sessions: runtime.sessions(),
        saved,
        models: models.ok ? modelInfos(models.data) : [],
        providers: providersView(),
        preferences: preferencesView(),
      };
      runtime.emitBuffered();
      return { ok: true as const, data: outcome };
    },
    'session/start': async (params) => {
      const result = await command({ type: 'thread/start', cwd: params.cwd, provider: params.provider, modelId: params.modelId, trusted: params.trusted });
      if (!result.ok) return fail(result.reason);
      const data = result.data as { threadId?: string; cwd?: string; sessionPath?: string | null };
      const threadId = data.threadId ?? '';
      if (threadId.length === 0) return fail('malformed_response');
      const view = runtime.applyStartOutcome(threadId, data.cwd ?? params.cwd, data.sessionPath ?? null, runtime.defaultTitle);
      fillSessionMeta(threadId);
      return { ok: true as const, data: view };
    },
    'session/resume': async (params) => {
      // 路径白名单：只允许恢复本应用 agentDir/sessions 下的会话文件（防被攻陷渲染层任意读）
      if (!insideSessionsRoot(params.sessionPath)) return fail('session_path_forbidden');
      const result = await command({ type: 'thread/resume', sessionPath: params.sessionPath, trusted: params.trusted });
      if (!result.ok) return fail(result.reason);
      const data = result.data as { threadId?: string; cwd?: string; sessionPath?: string | null };
      const threadId = data.threadId ?? '';
      if (threadId.length === 0) return fail('malformed_response');
      const view = runtime.applyStartOutcome(threadId, data.cwd ?? '', data.sessionPath ?? params.sessionPath, runtime.defaultTitle);
      fillSessionMeta(threadId);
      return { ok: true as const, data: view };
    },
    'session/stop': async (params) => {
      const result = await command({ type: 'thread/stop', threadId: params.threadId });
      if (!result.ok) return fail(result.reason);
      runtime.removeSession(params.threadId);
      return { ok: true as const, data: null };
    },
    'session/listSaved': async (params) => {
      return { ok: true as const, data: await savedAcrossCwds(params.cwd) };
    },
    'session/prompt': async (params) => {
      const result = await command({
        type: 'prompt',
        threadId: params.threadId,
        message: params.message,
        streamingBehavior: params.streamingBehavior,
      });
      if (!result.ok) return fail(result.reason);
      void runtime.autoTitleOnPrompt(params.threadId, params.message);
      return { ok: true as const, data: null };
    },
    'session/steer': async (params) => {
      const result = await command({ type: 'steer', threadId: params.threadId, message: params.message });
      return result.ok ? { ok: true as const, data: null } : fail(result.reason);
    },
    'session/followUp': async (params) => {
      const result = await command({ type: 'follow_up', threadId: params.threadId, message: params.message });
      return result.ok ? { ok: true as const, data: null } : fail(result.reason);
    },
    'session/abort': async (params) => {
      // Esc/停止语义 = 清队列 + 停止当前轮（api.md 客户端约定）
      await command({ type: 'clear_queue', threadId: params.threadId });
      const result = await command({ type: 'abort', threadId: params.threadId });
      return result.ok ? { ok: true as const, data: null } : fail(result.reason);
    },
    'session/entries': async (params) => {
      const result = await command({ type: 'get_entries', threadId: params.threadId, since: params.since });
      if (!result.ok) {
        // 游标失效（会话分支变化/重恢复）：全量重拉一次
        const full = await command({ type: 'get_entries', threadId: params.threadId });
        if (!full.ok) return fail(full.reason);
        const data = full.data as { entries?: unknown };
        return { ok: true as const, data: mapEntries(data.entries) };
      }
      const data = result.data as { entries?: unknown };
      return { ok: true as const, data: mapEntries(data.entries) };
    },
    'session/state': async (params) => {
      const result = await command({ type: 'get_state', threadId: params.threadId });
      if (!result.ok) return fail(result.reason);
      const view = threadStateView(result.data);
      runtime.touchSession(params.threadId, { model: view.model === null ? null : `${view.model.provider}/${view.model.modelId}`, thinkingLevel: view.thinkingLevel });
      return { ok: true as const, data: view };
    },
    'session/stats': async (params) => {
      const result = await command({ type: 'get_session_stats', threadId: params.threadId });
      return result.ok ? { ok: true as const, data: sessionStatsView(result.data) } : fail(result.reason);
    },
    'session/setName': async (params) => {
      const result = await command({ type: 'set_session_name', threadId: params.threadId, name: params.name });
      if (!result.ok) return fail(result.reason);
      runtime.renameSession(params.threadId, params.name);
      return { ok: true as const, data: null };
    },
    'session/setModel': async (params) => {
      const result = await command({ type: 'set_model', threadId: params.threadId, provider: params.provider, modelId: params.modelId });
      if (!result.ok) return fail(result.reason);
      runtime.touchSession(params.threadId, { model: `${params.provider}/${params.modelId}` });
      return { ok: true as const, data: null };
    },
    'session/setThinking': async (params) => {
      const level = parseThinkingLevel(params.level);
      if (level === null) return fail('invalid_params');
      const result = await command({ type: 'set_thinking_level', threadId: params.threadId, level });
      if (!result.ok) return fail(result.reason);
      runtime.touchSession(params.threadId, { thinkingLevel: level });
      return { ok: true as const, data: null };
    },
    'session/thinkingLevels': async (params) => {
      const result = await command({ type: 'get_thinking_levels', threadId: params.threadId });
      return result.ok ? { ok: true as const, data: thinkingLevels(result.data) } : fail(result.reason);
    },
    'session/compact': async (params) => {
      const result = await command({ type: 'compact', threadId: params.threadId });
      return result.ok ? { ok: true as const, data: null } : fail(result.reason);
    },
    'model/list': async () => {
      const result = await command({ type: 'get_models' });
      return result.ok ? { ok: true as const, data: modelInfos(result.data) } : fail(result.reason);
    },
    'auth/list': async () => {
      const result = await command({ type: 'auth/list' });
      if (!result.ok) return fail(result.reason);
      const credentials = (result.data as { credentials?: unknown }).credentials;
      const list = Array.isArray(credentials)
        ? credentials
            .map((item) => (typeof item === 'object' && item !== null ? item as Record<string, unknown> : null))
            .filter((item): item is Record<string, unknown> => item !== null)
            .map((item) => ({ provider: text(item['provider']), type: text(item['type']) }))
            .filter((item) => item.provider.length > 0)
        : [];
      return { ok: true as const, data: list };
    },
    'auth/setKey': async (params) => {
      const result = await command({ type: 'auth/set_api_key', provider: params.provider, apiKey: params.apiKey });
      return result.ok ? { ok: true as const, data: null } : fail(result.reason);
    },
    'auth/removeKey': async (params) => {
      const result = await command({ type: 'auth/remove_key', provider: params.provider });
      return result.ok ? { ok: true as const, data: null } : fail(result.reason);
    },
    'dialog/respond': async (params) => {
      // 任何情况下都必答（晚到/未知 id 由 host 静默忽略并 ack）；权限应答落审计日志
      const confirmed = params.payload['confirmed'] === true;
      const cancelled = params.payload['cancelled'] === true;
      deps.audit(`dialog_respond:${params.requestId}:${cancelled ? 'cancelled' : confirmed ? 'confirmed' : 'value'}`);
      const result = await command({ type: 'ui_response', requestId: params.requestId, payload: params.payload });
      return result.ok ? { ok: true as const, data: null } : fail(result.reason);
    },
    'command/list': async (params) => {
      const result = await command({ type: 'get_commands', threadId: params.threadId });
      return result.ok ? { ok: true as const, data: sessionCommands(result.data) } : fail(result.reason);
    },
    'permission/read': () => {
      const parsed = PermissionRulesSchema.safeParse(deps.agentDirFiles.readJson('permission-rules.json'));
      // 缺文件/坏 JSON/形状不符 → 与 hub 热读一致的 ask 降级
      return Promise.resolve({ ok: true as const, data: parsed.success ? parsed.data : defaultPermissionRules() });
    },
    'permission/write': (params) => {
      const written = deps.agentDirFiles.writeJsonAtomic('permission-rules.json', params.rules);
      return Promise.resolve(written ? { ok: true as const, data: params.rules } : fail('write_failed'));
    },
    'subagent/steer': async (params) => {
      const result = await command({ type: 'subagent/steer', threadId: params.threadId, subagentId: params.subagentId, message: params.message });
      return result.ok ? { ok: true as const, data: null } : fail(result.reason);
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
        models: [...params.models],
        apiKey: params.apiKey,
      });
      await applyProviderChange();
      return { ok: true as const, data: providersView() };
    },
    'provider/remove': async (params) => {
      deps.settings.removeProvider(params.name);
      await applyProviderChange();
      return { ok: true as const, data: providersView() };
    },
    'provider/test': async (params) => {
      const outcome = await probe.probe(params.name);
      return outcome.ok ? { ok: true as const, data: { latencyMs: outcome.latencyMs } } : fail(outcome.reason);
    },
    'app/setPreference': (params) => {
      const patch: { defaultModel?: string | null; onboarded?: boolean } = {};
      if (params.defaultModel !== undefined) patch.defaultModel = params.defaultModel;
      if (params.onboarded !== undefined) patch.onboarded = params.onboarded;
      const next = deps.settings.patch(patch);
      return Promise.resolve({ ok: true as const, data: { defaultModel: next.defaultModel, onboarded: next.onboarded } });
    },
  };

  /** start/resume 后补齐模型与思考档信息（失败不打断主流程）。 */
  const fillSessionMeta = (threadId: string): void => {
    void routes['session/state']({ threadId }).catch(() => undefined);
  };

  function parseThinkingLevel(level: string): 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max' | null {
    const allowed = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'] as const;
    return allowed.includes(level as (typeof allowed)[number]) ? (level as (typeof allowed)[number]) : null;
  }

  const text = (value: unknown): string => (typeof value === 'string' ? value : '');

  return {
    async invoke(method: string, params: unknown): Promise<unknown> {
      const schema = ApiSchemas[method as ApiMethod];
      if (schema === undefined) return fail(`unknown_method:${method}`);
      let parsed: unknown;
      try {
        parsed = schema.params.parse(params);
      } catch {
        return fail('invalid_params');
      }
      try {
        return await routes[method as ApiMethod](parsed as never);
      } catch {
        // 路由实现内未捕获的异常（磁盘错/装配面）统一收窄，不沿 IPC reject 到渲染层
        return fail('internal_error');
      }
    },

    providersView,
  };
}
