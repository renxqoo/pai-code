import type { AgentDefinitionsPort, RuntimePort } from './ports';

import type { ApiError, ApiMethod, ApiOutcome, ApiParams } from '@paiapp/contracts';
import { appError } from '../errors';
import type { AgentCommands } from '../commands/agents';
import type { ThreadCommands } from '../commands/thread';


/**
 * 线程域写操作路由组（api-routes 的会话级子集）：agent 定义 user 级 CRUD 的 hub
 * agents 域分派（D6——round-trip 由 hub 保证）与会话删除（thread/delete：白名单同
 * resume、幂等、注册表行按 removed 集收敛）。
 */

type Handler<M extends ApiMethod> = (params: ApiParams<M>) => Promise<ApiOutcome<M>>;

/** agent 定义文件面失败 → ApiError（校验族 → invalid_params 带 token；名冲突并
 *  name_conflict 族；写盘失败并 io_failed 族——message 保真原 token）。 */
function definitionError(reason: string): ApiError {
  if (reason === 'name_exists') return { kind: 'name_conflict', message: 'name_exists' };
  if (reason === 'write_failed' || reason === 'remove_failed') return { kind: 'io_failed', message: reason };
  return appError('invalid_params', reason);
}

export function threadOpsRoutes(deps: {
  agentCommands: () => AgentCommands;
  threadCommands: () => ThreadCommands;
  fail: (error: ApiError) => { ok: false; error: ApiError };
  runtime: RuntimePort;
  rootDeps: { audit: (message: string) => void; agentDefinitions: AgentDefinitionsPort; knownCwds: () => string[]; insideSessionsRoot: (sessionPath: string) => boolean };
}): {
  'agent/upsert': Handler<'agent/upsert'>;
  'agent/remove': Handler<'agent/remove'>;
  'session/delete': Handler<'session/delete'>;
} {
  const { fail, runtime } = deps;
  const { audit, agentDefinitions, knownCwds, insideSessionsRoot } = deps.rootDeps;
  return {
'agent/upsert': async (params) => {
      // user 级走 hub agents 域（round-trip 复析由 hub 保证——写删即生效且格式永不漂移）；
      // 已存在 = 编辑语义：先 remove 再 create（hub create 拒已存在）
      if (params.definition.scope === 'user') {
        const existed = await deps.agentCommands().removeAgent({ name: params.previous !== null ? params.previous.name : params.definition.name });
        if (!existed.ok && existed.error.kind !== 'state_conflict' && existed.error.kind !== 'invalid_input') return fail(existed.error);
        const created = await deps.agentCommands().createAgent({
          name: params.definition.name,
          description: params.definition.description,
          systemPrompt: params.definition.systemPrompt,
          ...(params.definition.model !== null ? { model: params.definition.model } : {}),
          ...(params.definition.tools !== null ? { tools: params.definition.tools } : {}),
        });
        if (!created.ok) return fail(created.error);
        audit(`agent_upsert: user/${params.definition.name}`);
        return { ok: true as const, data: null };
      }
      const result = agentDefinitions.upsert(params.definition, params.previous, knownCwds());
      if (!result.ok) return fail(definitionError(result.reason));
      audit(`agent_upsert: project(${params.definition.project})/${params.definition.name}`);
      return { ok: true as const, data: null };
  },
'agent/remove': async (params) => {
      if (params.scope === 'user') {
        const removed = await deps.agentCommands().removeAgent({ name: params.name });
        if (!removed.ok) return fail(removed.error);
        audit(`agent_remove: user/${params.name}`);
        return { ok: true as const, data: null };
      }
      const result = agentDefinitions.remove(params, knownCwds());
      if (!result.ok) return fail(definitionError(result.reason));
      audit(`agent_remove: project(${params.project})/${params.name}`);
      return { ok: true as const, data: null };
  },
'session/delete': async (params) => {
      // 白名单同 resume（sessionsRoot 围栏）；活族先拒（UI 提示先停止）；幂等（removed 可空）
      if (!insideSessionsRoot(params.sessionPath)) return fail(appError('session_path_forbidden'));
      const result = await deps.threadCommands().delete({ sessionPath: params.sessionPath });
      if (!result.ok) return fail(result.error);
      const removed = (result.data as { removed?: unknown }).removed;
      // 注册表行按路径收敛（removed 集含级联子——行存在即移除；缺席行无操作）
      for (const row of runtime.registry.list()) {
        if (params.sessionPath === row.sessionPath || (Array.isArray(removed) && removed.includes(row.threadId))) {
          runtime.removeSession(row.threadId);
        }
      }
      return {
        ok: true as const,
        data: { removed: Array.isArray(removed) ? removed.filter((id): id is string => typeof id === 'string') : [] },
      };
  },
  };
}
