import type { ApiMethod, ApiOutcome, ApiParams } from '@paiapp/contracts';

import type { createApiRoutes } from './api-routes';
import type { PaiRuntime } from './pai-runtime';
import type { AgentDefinitionsStore } from './agent-definitions-store';

/**
 * 线程域写操作路由组（api-routes 的会话级子集）：agent 定义 user 级 CRUD 的 hub
 * 命令分派（D6——round-trip 由 hub 保证）与会话删除（thread/delete：白名单同
 * resume、幂等、注册表行按 removed 集收敛）。
 */

type Handler<M extends ApiMethod> = (params: ApiParams<M>) => Promise<ApiOutcome<M>>;

type Command = Parameters<Parameters<typeof createApiRoutes>[0]['runtime']['host']['request']>[0];

export function threadOpsRoutes(deps: {
  command: (cmd: Command, timeoutMs?: number) => Promise<{ ok: true; data: unknown } | { ok: false; reason: string }>;
  fail: (reason: string) => { ok: false; reason: string };
  runtime: PaiRuntime;
  rootDeps: { audit: (message: string) => void; agentDefinitions: AgentDefinitionsStore; knownCwds: () => string[]; insideSessionsRoot: (sessionPath: string) => boolean };
}): {
  'agent/upsert': Handler<'agent/upsert'>;
  'agent/remove': Handler<'agent/remove'>;
  'session/delete': Handler<'session/delete'>;
} {
  const { command, fail, runtime } = deps;
  const { audit, agentDefinitions, knownCwds, insideSessionsRoot } = deps.rootDeps;
  return {
'agent/upsert': async (params) => {
      // user 级走 hub 命令（round-trip 复析由 hub 保证——写删即生效且格式永不漂移）；
      // 已存在 = 编辑语义：先 remove 再 create（hub create 拒已存在）
      if (params.definition.scope === 'user') {
        const existed = await command({ type: 'agents/remove', name: params.previous !== null ? params.previous.name : params.definition.name });
        if (!existed.ok && !/not user-defined|unknown agent type/.test(existed.reason)) return fail(existed.reason);
        const created = await command({
          type: 'agents/create',
          name: params.definition.name,
          description: params.definition.description,
          systemPrompt: params.definition.systemPrompt,
          ...(params.definition.model !== null ? { model: params.definition.model } : {}),
          ...(params.definition.tools !== null ? { tools: params.definition.tools } : {}),
        });
        if (!created.ok) return fail(created.reason);
        audit(`agent_upsert: user/${params.definition.name}`);
        return { ok: true as const, data: null };
      }
      const result = agentDefinitions.upsert(params.definition, params.previous, knownCwds());
      if (!result.ok) return fail(result.reason);
      audit(`agent_upsert: project(${params.definition.project})/${params.definition.name}`);
      return { ok: true as const, data: null };
  },
'agent/remove': async (params) => {
      if (params.scope === 'user') {
        const removed = await command({ type: 'agents/remove', name: params.name });
        if (!removed.ok) return fail(removed.reason);
        audit(`agent_remove: user/${params.name}`);
        return { ok: true as const, data: null };
      }
      const result = agentDefinitions.remove(params, knownCwds());
      if (!result.ok) return fail(result.reason);
      audit(`agent_remove: project(${params.project})/${params.name}`);
      return { ok: true as const, data: null };
  },
'session/delete': async (params) => {
      // 白名单同 resume（sessionsRoot 围栏）；活族先拒（UI 提示先停止）；幂等（removed 可空）
      if (!insideSessionsRoot(params.sessionPath)) return fail('session_path_forbidden');
      const result = await command({ type: 'thread/delete', sessionPath: params.sessionPath });
      if (!result.ok) return fail(result.reason);
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
