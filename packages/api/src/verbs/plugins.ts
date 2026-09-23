/**
 * 插件域路由组（plugin-runtime §M3）：清单/启停/候选扫描/导入/热装/热卸。
 * 形态判定与落盘的单一判定源 = hub `plugins/*` 命令面——本组只做编排
 * （批准根白名单门、错误映射、热装转发），零装载器规则镜像。
 * P2 审批语义：import 的 UI 面必须明示「确认安装 = 授予插件全部平台能力」——
 * 文案层职责（M4 strings），此处错误/数据形状不弱化该语义。
 */
import type { ApiError, ApiMethod, ApiOutcome, ApiParams, PluginCandidateView, PluginProposalRow, PluginView } from '@paiapp/contracts';

import type { SettingsCommands } from '../commands/settings';
import { appError } from '../errors';
import { errorLogToken } from './error-log-token';
import { isPathInside } from './skills-import';
import type { PluginSourcePort } from './plugin-source';

type Handler<M extends ApiMethod> = (params: ApiParams<M>) => Promise<ApiOutcome<M>>;

/** hub plugins/inspect 应答行的 app 侧形状（收窄后）。 */
interface InspectRow {
  sourcePath: string;
  state: 'ready' | 'rename' | 'blocked';
  manifest?: { name: string; apiVersion: number; description?: string };
  problem?: string;
}

/** 批量形态检查单批上限（镜像 x-harness shared/limits.ts PLUGIN_INSPECT_MAX_PATHS）。 */
const INSPECT_BATCH = 200;

export type PluginRoutesDeps = {
  /** hub settings 域 accessor（惰性：路由构造早于 runtime.start）。 */
  settingsCommands: () => SettingsCommands;
  /** 插件源面（主进程实现：批准根门 + 候选发现）。 */
  sources: PluginSourcePort;
  /** 热装目标（活跃 thread id → plugins/hot_install 转发；缺省不热装——导入后下次装配生效）。 */
  hotInstallTargets?: () => readonly string[];
  /** 拒绝/失败落诊断日志。 */
  onReject?: (message: string) => void;
};

/** hub plugins/* 应答形状收窄（坏形状走 malformed 兜底不静默）。 */
export function pluginRowsOf(data: unknown): PluginView[] | undefined {
  if (typeof data !== 'object' || data === null) return undefined;
  const raw = (data as { plugins?: unknown }).plugins;
  if (!Array.isArray(raw)) return undefined;
  const out: PluginView[] = [];
  for (const item of raw) {
    if (typeof item !== 'object' || item === null) continue;
    const entry = item as Record<string, unknown>;
    if (typeof entry['name'] !== 'string' || entry['name'].length === 0) continue;
    const source = entry['source'] === 'builtin' ? 'builtin' : entry['source'] === 'vendor' ? 'vendor' : null;
    if (source === null) continue;
    const originRaw = entry['origin'];
    const origin = originRaw === 'manual' || originRaw === 'agent' ? originRaw : null;
    out.push({
      name: entry['name'],
      source,
      origin,
      version: typeof entry['version'] === 'number' ? entry['version'] : null,
      enabled: entry['enabled'] === true,
      status: entry['status'] === 'active' || entry['status'] === 'failed' || entry['status'] === 'disabled' || entry['status'] === 'unloaded' ? entry['status'] : 'unloaded',
      disabledReason: typeof entry['disabledReason'] === 'string' ? entry['disabledReason'] : null,
      description: typeof entry['description'] === 'string' ? entry['description'] : null,
      path: typeof entry['path'] === 'string' ? entry['path'] : null,
    });
  }
  return out;
}

/** hub 错误 → app 错误 kind（plugins 域映射矩阵）。 */
export function mapPluginError(error: ApiError, fallback: AppErrorFallback): ApiError {
  if (error.kind === 'invalid_input') return appError('plugin_source_invalid', error.message);
  if (error.kind === 'name_conflict') return appError('plugin_exists', error.message);
  if (error.kind === 'state_conflict') {
    // builtin 不可删 / 未知名——按语义分派（hub message 含 builtin 字样即 builtin 面）
    if (error.message.includes('builtin')) return appError('plugin_builtin_immutable', error.message);
    return appError('plugin_source_invalid', error.message);
  }
  if (error.kind === 'plugin_install_failed' || error.kind === 'plugin_uninstall_failed') return error;
  if (error.kind === 'io_failed') return appError('plugin_source_invalid', error.message);
  return fallback(error);
}

type AppErrorFallback = (error: ApiError) => ApiError;

export function createPluginRoutes(deps: PluginRoutesDeps) {
  const fail = (error: ApiError): Promise<{ ok: false; error: ApiError }> => {
    deps.onReject?.(`plugin_route_rejected:${errorLogToken(error)}`);
    return Promise.resolve({ ok: false, error });
  };

  const commands = () => deps.settingsCommands();

  /** 插件清单（hub plugins/list 收窄；host 未启动降级空表）。 */
  const pluginsList = async (): Promise<PluginView[]> => {
    const result = await commands().listPlugins({});
    if (!result.ok) return [];
    const rows = pluginRowsOf(result.data);
    return rows ?? [];
  };

  /** 候选形态合并（inspect 三态 + 源面 origin）。 */
  const combineCandidate = (
    inspected: { sourcePath: string; state: 'ready' | 'rename' | 'blocked'; manifest?: { name: string; apiVersion: number; description?: string }; problem?: string },
    origin: PluginCandidateView['origin'],
  ): PluginCandidateView => {
    const sourcePath = inspected.sourcePath;
    if (inspected.state === 'blocked') {
      return {
        name: sourcePath.split('/').filter(Boolean).pop() ?? sourcePath,
        description: '',
        sourcePath,
        origin,
        state: 'blocked',
        problem: inspected.problem ?? 'unknown problem',
      };
    }
    const manifest = inspected.manifest;
    return {
      name: manifest?.name ?? sourcePath.split('/').filter(Boolean).pop() ?? sourcePath,
      description: manifest?.description ?? '',
      sourcePath,
      origin,
      state: inspected.state,
      problem: inspected.state === 'rename' ? 'name_mismatch' : null,
    };
  };

  const routes: {
    'plugins/list': Handler<'plugins/list'>;
    'plugins/setEnabled': Handler<'plugins/setEnabled'>;
    'plugins/candidates': Handler<'plugins/candidates'>;
    'plugins/import': Handler<'plugins/import'>;
    'plugins/remove': Handler<'plugins/remove'>;
    'plugins/hotInstall': Handler<'plugins/hotInstall'>;
    'plugins/hotUninstall': Handler<'plugins/hotUninstall'>;
    'plugins/proposals': Handler<'plugins/proposals'>;
    'plugins/confirmProposal': Handler<'plugins/confirmProposal'>;
    'plugins/rejectProposal': Handler<'plugins/rejectProposal'>;
  } = {
    'plugins/list': async () => ({ ok: true as const, data: await pluginsList() }),
    'plugins/setEnabled': async (params) => {
      const result = await commands().setPluginEnabled({ name: params.name, enabled: params.enabled });
      if (!result.ok) return fail(mapPluginError(result.error, (e) => e));
      return { ok: true as const, data: await pluginsList() };
    },
    // 候选扫描：源面发现（白名单门）→ hub 批量形态判定（分批 ≤200）→ 三态视图
    'plugins/candidates': async (params) => {
      const discovered = await deps.sources.discover(params.sourcePath);
      if (!discovered.ok) return fail(discovered.error);
      const originByPath = new Map(discovered.found.map((item) => [item.sourcePath, item.origin]));
      const inspected: InspectRow[] = [];
      for (let start = 0; start < discovered.found.length; start += INSPECT_BATCH) {
        const batch = discovered.found.slice(start, start + INSPECT_BATCH).map((item) => item.sourcePath);
        const outcome = await inspectBatch(batch);
        if (!outcome.ok) return fail(mapPluginError(outcome.error, (e) => e));
        inspected.push(...outcome.data.results);
      }
      return {
        ok: true as const,
        data: { candidates: inspected.map((item) => combineCandidate(item, originByPath.get(item.sourcePath) ?? 'picked')) },
      };
    },
    // 导入：白名单门 → hub install（形态判定在 hub 单点）→ 写后回读断言 → 热装编排
    'plugins/import': async (params) => {
      const gate = await deps.sources.gate(params.sourcePath);
      if (!gate.ok) return fail(gate.error);
      const inspected = await inspectBatch([params.sourcePath]);
      if (!inspected.ok) return fail(mapPluginError(inspected.error, (e) => e));
      const candidate = combineCandidate(inspected.data.results[0] ?? { sourcePath: params.sourcePath, state: 'blocked', problem: 'source not found' }, gate.origin);
      if (candidate.state === 'blocked') {
        return fail(appError('plugin_source_invalid', candidate.problem ?? undefined));
      }
      const installed = await commands().installPlugin({
        sourcePath: params.sourcePath,
        ...(params.overwrite ? { overwrite: true } : {}),
        ...(gate.origin === 'agent' ? { origin: 'agent' as const } : {}),
        ...(params.proposalId !== undefined ? { proposalId: params.proposalId } : {}),
      });
      if (!installed.ok) return fail(mapPluginError(installed.error, (e) => e));
      const raw = (installed.data as { plugin?: { name?: unknown; sha256?: unknown } }).plugin;
      const name = typeof raw?.name === 'string' ? raw.name : candidate.name;
      const sha256 = typeof raw?.sha256 === 'string' ? raw.sha256 : '';
      // 热装编排：活跃 thread 逐个转发（失败不阻断导入——下次装配生效）
      const targets = deps.hotInstallTargets?.() ?? [];
      for (const threadId of targets) {
        await commands().hotInstallPlugin({ threadId, name }).catch(() => undefined);
      }
      const plugins = await pluginsList();
      const landed = plugins.some((row) => row.name === name && row.source === 'vendor');
      if (!landed) return fail(appError('plugin_source_invalid', `plugin written but absent from plugins/list: ${name}`));
      return { ok: true as const, data: { plugins, imported: { name, sha256 } } };
    },
    'plugins/remove': async (params) => {
      const result = await commands().removePlugin({ name: params.name });
      if (!result.ok) return fail(mapPluginError(result.error, (e) => e));
      return { ok: true as const, data: await pluginsList() };
    },
    'plugins/hotInstall': async (params) => {
      const result = await commands().hotInstallPlugin({ threadId: params.threadId, name: params.name });
      if (!result.ok) return fail(mapPluginError(result.error, (e) => e));
      const raw = (result.data as { name?: unknown; mode?: unknown });
      return { ok: true as const, data: { name: typeof raw?.name === 'string' ? raw.name : params.name, mode: typeof raw?.mode === 'string' ? raw.mode : 'worker' } };
    },
    'plugins/hotUninstall': async (params) => {
      const result = await commands().hotUninstallPlugin({ threadId: params.threadId, name: params.name, ...(params.force ? { force: true } : {}) });
      if (!result.ok) return fail(mapPluginError(result.error, (e) => e));
      return { ok: true as const, data: { name: params.name } };
    },
    // agent 提案面板：登记态直读（P2 文案面——UI 展示能力声明与哈希）
    'plugins/proposals': async () => {
      const result = await commands().listPluginProposals({});
      if (!result.ok) return fail(mapPluginError(result.error, (e) => e));
      const raw = (result.data as { proposals?: unknown }).proposals;
      if (!Array.isArray(raw)) return { ok: false as const, error: { kind: 'malformed_response' as const } };
      const proposals = raw.flatMap((item: unknown): PluginProposalRow[] => {
        if (typeof item !== 'object' || item === null) return [];
        const entry = item as Record<string, unknown>;
        if (typeof entry['proposalId'] !== 'string' || typeof entry['sourcePath'] !== 'string' || typeof entry['name'] !== 'string') return [];
        if (typeof entry['description'] !== 'string' || typeof entry['sha256'] !== 'string' || typeof entry['createdAt'] !== 'number' || typeof entry['confirmed'] !== 'boolean') return [];
        if (!Array.isArray(entry['requestedCapabilities'])) return [];
        return [{
          proposalId: entry['proposalId'],
          sourcePath: entry['sourcePath'],
          name: entry['name'],
          description: entry['description'],
          requestedCapabilities: entry['requestedCapabilities'].filter((cap): cap is string => typeof cap === 'string'),
          sha256: entry['sha256'],
          createdAt: entry['createdAt'],
          confirmed: entry['confirmed'],
        }];
      });
      return { ok: true as const, data: { proposals } };
    },
    'plugins/confirmProposal': async (params) => {
      const result = await commands().confirmPluginProposal({ proposalId: params.proposalId });
      if (!result.ok) return fail(mapPluginError(result.error, (e) => e));
      return { ok: true as const, data: null };
    },
    'plugins/rejectProposal': async (params) => {
      const result = await commands().rejectPluginProposal({ proposalId: params.proposalId });
      if (!result.ok) return fail(mapPluginError(result.error, (e) => e));
      return { ok: true as const, data: null };
    },
  };

  async function inspectBatch(sourcePaths: string[]): Promise<{ ok: true; data: { results: InspectRow[] } } | { ok: false; error: ApiError }> {
    const result = await commands().inspectPlugins({ sourcePaths });
    if (!result.ok) return result;
    const raw = (result.data as { results?: unknown }).results;
    if (!Array.isArray(raw)) return { ok: false, error: { kind: 'malformed_response' } };
    const results: InspectRow[] = raw.map((item: unknown): InspectRow => {
      const entry = (typeof item === 'object' && item !== null ? item : {}) as Record<string, unknown>;
      const state = entry['state'] === 'ready' || entry['state'] === 'rename' || entry['state'] === 'blocked' ? entry['state'] : 'blocked';
      const manifestRaw = entry['manifest'] as Record<string, unknown> | undefined;
      const manifest = manifestRaw !== undefined && typeof manifestRaw['name'] === 'string' && typeof manifestRaw['apiVersion'] === 'number'
        ? {
            name: manifestRaw['name'] as string,
            apiVersion: manifestRaw['apiVersion'] as number,
            ...(typeof manifestRaw['description'] === 'string' ? { description: manifestRaw['description'] as string } : {}),
          }
        : undefined;
      return {
        sourcePath: typeof entry['sourcePath'] === 'string' ? entry['sourcePath'] : '',
        state,
        ...(manifest !== undefined ? { manifest } : {}),
        ...(typeof entry['problem'] === 'string' ? { problem: entry['problem'] } : {}),
      };
    });
    return { ok: true, data: { results } };
  }

  return { pluginsList, routes };
}

export { isPathInside };
