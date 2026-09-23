import type { ApiError, ApiMethod, ApiOutcome, ApiParams, SkillCandidateView, SkillView } from '@paiapp/contracts';

import type { SettingsCommands } from '../commands/settings';
import { appError } from '../errors';
import { errorLogToken } from './error-log-token';
import {
  combineCandidate,
  mapSkillInspectError,
  mapSkillInstallError,
  planImport,
  skillProblemKind,
} from './skills-import';
import { createSkillInstallPort, type SkillInstallPort } from './skill-install-port';

/**
 * 技能域路由组（自 settings.ts 拆出，T42 §4）：清单/启停/候选扫描/导入。
 * H 路线（D1=H）：形态判定与落盘的单一判定源 = hub `skills/inspect`|`skills/install`
 * （x-harness docs/SKILL-INSTALL.md）——本组只做编排（批准根白名单门、围栏预检、
 * 写后回读断言、错误映射），**零装载器规则镜像**。
 */

type Handler<M extends ApiMethod> = (params: ApiParams<M>) => Promise<ApiOutcome<M>>;

/** 批量形态检查单批上限（镜像 x-harness shared/limits.ts SKILL_INSPECT_MAX_PATHS）。 */
const INSPECT_BATCH = 200;

/** 技能源面（主进程实现：批准根解析 + realpath 越界拒绝 + 两深度发现）。 */
export interface SkillSourcePort {
  /** 候选发现（含白名单门）；sourcePath 缺省 = 三个内置源根全扫。 */
  discover(sourcePath?: string): Promise<
    | { ok: true; found: Array<{ sourcePath: string; origin: SkillCandidateView['origin'] }> }
    | { ok: false; error: ApiError }
  >;
  /** 导入源门（realpath 归一 + 批准根包含判定）；返回来源标签。 */
  gate(sourcePath: string): Promise<
    { ok: true; origin: SkillCandidateView['origin'] } | { ok: false; error: ApiError }
  >;
}

/** fail-closed 缺省源面（未接线形态）：门恒拒、扫描恒空——不放大能力面。 */
export const failClosedSkillSources: SkillSourcePort = {
  discover: () => Promise.resolve({ ok: true, found: [] }),
  gate: (sourcePath) => Promise.resolve({
    ok: false,
    error: appError('skill_source_invalid', `skill source gate not wired: ${sourcePath}`),
  }),
};

export type SkillRoutesDeps = {
  /** hub settings 域 accessor（惰性：路由构造早于 runtime.start）。 */
  settingsCommands: () => SettingsCommands;
  /** 技能源面（装配层注入主进程实现）。 */
  sources: SkillSourcePort;
  /** hub 技能安装端口（缺省从 settingsCommands 构造；测试可注入替身）。 */
  installPort?: SkillInstallPort;
  /** 拒绝/失败落诊断日志。 */
  onReject?: (message: string) => void;
};

export function createSkillRoutes(deps: SkillRoutesDeps) {
  const fail = (error: ApiError): Promise<{ ok: false; error: ApiError }> => {
    deps.onReject?.(`skill_route_rejected:${errorLogToken(error)}`);
    return Promise.resolve({ ok: false, error });
  };

  /** hub 安装端口（惰性——settingsCommands 随 host 生命周期）。 */
  const port = (): SkillInstallPort => deps.installPort ?? createSkillInstallPort(deps.settingsCommands());

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

  const routes: {
    'skills/list': Handler<'skills/list'>;
    'skills/setEnabled': Handler<'skills/setEnabled'>;
    'skills/candidates': Handler<'skills/candidates'>;
    'skills/import': Handler<'skills/import'>;
    'skills/remove': Handler<'skills/remove'>;
  } = {
    'skills/list': async () => ({ ok: true as const, data: await skillsList() }),
    'skills/setEnabled': async (params) => {
      const result = await deps.settingsCommands().setSkillEnabled({ name: params.name, enabled: params.enabled });
      if (!result.ok) return fail(result.error);
      return { ok: true as const, data: await skillsList() };
    },
    // 候选扫描：发现（白名单门）→ hub 批量形态判定（分批 ≤200）→ 三态视图
    'skills/candidates': async (params) => {
      const discovered = await deps.sources.discover(params.sourcePath);
      if (!discovered.ok) return fail(discovered.error);
      const originByPath = new Map(discovered.found.map((item) => [item.sourcePath, item.origin]));
      const inspected = [];
      for (let start = 0; start < discovered.found.length; start += INSPECT_BATCH) {
        const batch = discovered.found.slice(start, start + INSPECT_BATCH).map((item) => item.sourcePath);
        const result = await port().inspectSources({ sourcePaths: batch });
        if (!result.ok) return fail(mapSkillInspectError(result.error));
        inspected.push(...result.data.results);
      }
      return {
        ok: true as const,
        data: {
          candidates: inspected.map((item) => combineCandidate(item, originByPath.get(item.sourcePath) ?? 'picked')),
        },
      };
    },
    // 导入单个技能：白名单门 → 形态判定（blocked 直接拒）→ 计划（围栏/冲突预检）
    // → hub install → 写后回读断言（镜像漂移的显式出口 skill_not_registered）
    'skills/import': async (params) => {
      const gate = await deps.sources.gate(params.sourcePath);
      if (!gate.ok) return fail(gate.error);
      const inspected = await port().inspectSources({ sourcePaths: [params.sourcePath] });
      if (!inspected.ok) return fail(mapSkillInspectError(inspected.error));
      const candidate = combineCandidate(inspected.data.results[0] ?? {
        sourcePath: params.sourcePath,
        state: 'blocked',
        problem: 'not_found',
      }, gate.origin);
      if (candidate.state === 'blocked') {
        return fail(appError(skillProblemKind(candidate.problem ?? 'missing_fields'), candidate.problem ?? undefined));
      }
      const planned = planImport({
        candidate,
        ...(params.name === undefined ? {} : { name: params.name }),
        overwrite: params.overwrite,
        installed: await skillsList(),
      });
      if (!planned.ok) return fail(planned.error);
      const installed = await port().installSkill(planned.plan);
      if (!installed.ok) return fail(mapSkillInstallError(installed.error));
      const skills = await skillsList();
      const landed = skills.some((skill) => skill.name === installed.data.name && skill.source === 'user');
      if (!landed) return fail(appError('skill_not_registered', `skill written but absent from skills/list: ${installed.data.name}`));
      return { ok: true as const, data: { skills, imported: { name: installed.data.name, path: installed.data.path } } };
    },
    // 删除用户级技能（D-1 修复后 hub 删整技能目录）；结果为写后清单
    'skills/remove': async (params) => {
      const result = await deps.settingsCommands().removeSkill({ name: params.name });
      if (!result.ok) return fail(mapSkillRemoveError(result.error));
      return { ok: true as const, data: await skillsList() };
    },
  };

  return { skillsList, routes };
}

/** hub skills/remove 失败 → app 错误 kind（无「源」语义：invalid_input 均涉名围栏）。 */
function mapSkillRemoveError(error: ApiError): ApiError {
  if (error.kind === 'invalid_input') return appError('skill_name_invalid', error.message);
  return mapSkillInstallError(error);
}
