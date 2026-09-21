import type { ApiError, ApiMethod, ApiOutcome, ApiParams } from '@paiapp/contracts';
import {
  appError,
  inflightView,
  mapEntries,
  modelInfos,
  sessionStatsView,
  subagentSnapshotView,
  pendingDialogsView,
  threadStateView,
  thinkingLevelView,
  type ModelCommands,
  type PermissionCommands,
  type SessionCommands,
  type ThreadCommands,
} from '../index';

import type { savedSessions } from '../index';
import type { AuditPort, FailPort, RuntimePort } from './ports';

import type { ModelInfoView } from '@paiapp/contracts';
import { THINKING_LEVEL_ORDER, type ThinkingLevel } from '@paiapp/contracts';


type Handler<M extends ApiMethod> = (params: ApiParams<M>) => Promise<ApiOutcome<M>>;
type Fail = (error: ApiError) => { ok: false; error: ApiError };

/**
 * 会话域路由组（api-routes 的会话生命周期/读面/写面 + 模型目录 + 权限模式）：
 * 业务（注册表落行/换轨/占位短路/游标全量兜底）与视图收窄在此，hub 调用经域接口。
 */
/** 直执行 bash 路由处理器（表外命名：session/prompt 的 `! ` 分支复用同一实现——
 *  audit/24h 长命档/结果收窄不得分叉）。 */
export function bashRouteHandler(deps: { sessionCommands: () => SessionCommands; fail: FailPort; audit: AuditPort }) {
  return async (params: ApiParams<'session/bash'>): Promise<ApiOutcome<'session/bash'>> => {
    deps.audit(`bash_run:${params.threadId}`);
    // hub bash 完成才回包（bash 域方法 24h 长命档）：30s 缺省超时会误报仍在执行的命令
    const result = await deps.sessionCommands().bash({ threadId: params.threadId, command: params.command });
    if (!result.ok) return deps.fail(result.error);
    const data = result.data as { output?: unknown; exitCode?: unknown; cancelled?: unknown; truncated?: unknown; fullOutputPath?: unknown };
    return {
      ok: true as const,
      data: {
        output: typeof data.output === 'string' ? data.output : '',
        exitCode: typeof data.exitCode === 'number' ? data.exitCode : 0,
        cancelled: data.cancelled === true,
        truncated: data.truncated === true,
        fullOutputPath: typeof data.fullOutputPath === 'string' ? data.fullOutputPath : null,
      },
    };
  };
}

export function sessionRoutes(deps: {
  sessionCommands: () => SessionCommands;
  threadCommands: () => ThreadCommands;
  modelCommands: () => ModelCommands;
  permissionCommands: () => PermissionCommands;
  fail: Fail;
  runtime: RuntimePort;
  audit: (message: string) => void;
  savedAcrossCwds: (cwd?: string) => Promise<ReturnType<typeof savedSessions>>;
  channelModels: (models: readonly ModelInfoView[]) => ModelInfoView[];
  insideSessionsRoot: (sessionPath: string) => boolean;
  revealPath: (path: string) => void;
  fillSessionMeta: (threadId: string) => void;
}): {
  'session/start': Handler<'session/start'>;
  'session/stop': Handler<'session/stop'>;
  'session/listSaved': Handler<'session/listSaved'>;
  'session/abort': Handler<'session/abort'>;
  'session/entries': Handler<'session/entries'>;
  'session/inflight': Handler<'session/inflight'>;
  'session/subagents': Handler<'session/subagents'>;
  'session/pendingDialogs': Handler<'session/pendingDialogs'>;
  'session/state': Handler<'session/state'>;
  'session/stats': Handler<'session/stats'>;
  'session/setName': Handler<'session/setName'>;
  'session/setModel': Handler<'session/setModel'>;
  'session/setThinking': Handler<'session/setThinking'>;
  'session/thinkingLevels': Handler<'session/thinkingLevels'>;
  'session/fork': Handler<'session/fork'>;
  'session/reveal': Handler<'session/reveal'>;
  'session/bash': Handler<'session/bash'>;
  'session/clearQueue': Handler<'session/clearQueue'>;
  'session/abortBash': Handler<'session/abortBash'>;
  'model/list': Handler<'model/list'>;
  'permission/mode': Handler<'permission/mode'>;
  'permission/setMode': Handler<'permission/setMode'>;
} {
  const { fail, runtime } = deps;
  const sc = deps.sessionCommands;
  const tc = deps.threadCommands;
  const mc = deps.modelCommands;
  const pc = deps.permissionCommands;
  return {
    'session/start': async (params) => {
      if (params.trusted !== undefined) deps.audit(`session_trusted:start:${params.cwd}:${params.trusted}`);
      const result = await tc().start({
        cwd: params.cwd,
        modelId: params.modelId,
        trusted: params.trusted,
        ...(params.permissionMode !== undefined ? { permissionMode: params.permissionMode } : {}),
        ...(params.thinkingLevel !== undefined ? { thinkingLevel: params.thinkingLevel } : {}),
      });
      if (!result.ok) return fail(result.error);
      const data = result.data as { threadId?: string; cwd?: string; sessionPath?: string | null };
      const threadId = data.threadId ?? '';
      if (threadId.length === 0) return fail(appError('malformed_response'));
      const view = runtime.applyStartOutcome(threadId, data.cwd ?? params.cwd, data.sessionPath ?? null, runtime.defaultTitle, Date.now(), params.trusted ?? false);
      deps.fillSessionMeta(threadId);
      return { ok: true as const, data: view };
    },
    'session/stop': async (params) => {
      const result = await tc().stop({ threadId: params.threadId });
      if (!result.ok) return fail(result.error);
      // remove=false：内部重开链（trusted 重载/技能开关）只摘视图，注册表行是随后 resume 的 title/trusted 补全源
      if (params.remove) runtime.removeSession(params.threadId);
      else runtime.detachSession(params.threadId);
      return { ok: true as const, data: null };
    },
    'session/listSaved': async (params) => {
      return { ok: true as const, data: await deps.savedAcrossCwds(params.cwd) };
    },
    'session/abort': async (params) => {
      // Esc/停止语义 = 清队列 + 停止当前轮（客户端约定）
      await sc().clearQueue({ threadId: params.threadId });
      const result = await sc().abort({ threadId: params.threadId });
      return result.ok ? { ok: true as const, data: null } : fail(result.error);
    },
    'session/entries': async (params) => {
      const result = await sc().getEntries({ threadId: params.threadId, ...(params.since !== undefined ? { since: params.since } : {}) });
      // 全量兜底只认游标失效（分支变化/重恢复；hub 码 cursor_stale）：
      // busy/timeout 等瞬态再叠一次全量拉取只会放大压力（30s 超时后再 30s）
      if (!result.ok && params.since !== undefined && result.error.kind === 'cursor_stale') {
        const full = await sc().getEntries({ threadId: params.threadId });
        if (!full.ok) return fail(full.error);
        return { ok: true as const, data: mapEntries(full.data) };
      }
      if (!result.ok) return fail(result.error);
      return { ok: true as const, data: mapEntries(result.data) };
    },
    'session/inflight': async (params) => {
      const result = await sc().getInflight({ threadId: params.threadId });
      return result.ok ? { ok: true as const, data: inflightView(result.data) } : fail(result.error);
    },
    'session/subagents': async (params) => {
      const result = await sc().getSubagents({ threadId: params.threadId });
      return result.ok ? { ok: true as const, data: { subagents: subagentSnapshotView(result.data) } } : fail(result.error);
    },
    'session/pendingDialogs': async (params) => {
      const result = await sc().getPendingDialogs({ threadId: params.threadId });
      return result.ok ? { ok: true as const, data: { dialogs: pendingDialogsView(result.data) } } : fail(result.error);
    },
    'session/state': async (params) => {
      const result = await sc().getState({ threadId: params.threadId });
      if (!result.ok) return fail(result.error);
      const view = threadStateView(result.data);
      runtime.touchSession(params.threadId, { model: view.model === null ? null : `${view.model.provider}/${view.model.model}` });
      return { ok: true as const, data: view };
    },
    'session/stats': async (params) => {
      const result = await sc().getSessionStats({ threadId: params.threadId });
      return result.ok ? { ok: true as const, data: sessionStatsView(result.data) } : fail(result.error);
    },
    'session/setName': async (params) => {
      // parked 占位未进 host（setName 必回 Unknown threadId）：标题直接落注册表，
      // resume 路由按注册表行保留；hub 会话文件名待下次 live 重命名同步
      const parked = runtime.sessions().find((session) => session.threadId === params.threadId && session.state === 'parked') !== undefined;
      if (parked) {
        runtime.renameSession(params.threadId, params.name);
        return { ok: true as const, data: null };
      }
      const result = await sc().setSessionName({ threadId: params.threadId, name: params.name });
      if (!result.ok) return fail(result.error);
      runtime.renameSession(params.threadId, params.name);
      return { ok: true as const, data: null };
    },
    'session/setModel': async (params) => {
      const result = await mc().setModel({ threadId: params.threadId, provider: params.provider, modelId: params.modelId });
      if (!result.ok) return fail(result.error);
      runtime.touchSession(params.threadId, { model: `${params.provider}/${params.modelId}` });
      return { ok: true as const, data: null };
    },
    'session/setThinking': async (params) => {
      const level = parseThinkingLevel(params.level);
      if (level === null) return fail(appError('invalid_params'));
      const result = await mc().setThinkingLevel({ threadId: params.threadId, level });
      if (!result.ok) return fail(result.error);
      runtime.touchSession(params.threadId, { thinkingLevel: level });
      return { ok: true as const, data: null };
    },
    'session/thinkingLevels': async (params) => {
      const result = await mc().getThinkingLevel({ threadId: params.threadId });
      return result.ok ? { ok: true as const, data: thinkingLevelView(result.data) } : fail(result.error);
    },
    'model/list': async () => {
      const result = await mc().getModels();
      return result.ok ? { ok: true as const, data: deps.channelModels(modelInfos(result.data)) } : fail(result.error);
    },
    'session/fork': async (params) => {
      const result = await sc().fork({ threadId: params.threadId, seq: params.seq, position: params.position });
      if (!result.ok) return fail(result.error);
      const data = result.data as { threadId?: string; previousThreadId?: string; sessionPath?: string | null };
      const threadId = data.threadId ?? '';
      // previousThreadId 必须就是被分叉的会话：换轨响应对不上请求即坏形状（防 ABA）
      if (threadId.length === 0 || data.previousThreadId !== params.threadId) return fail(appError('malformed_response'));
      // 响应不带 cwd/标题：从被分叉会话继承（项目分组与侧栏语义跟原会话走）
      const source = runtime.sessions().find((session) => session.threadId === params.threadId);
      // fork 是原地换轨：旧 id 已从 hub 移除（会话文件保留、可懒恢复），旧行转 parked
      runtime.parkSession(params.threadId);
      const view = runtime.applyStartOutcome(threadId, source?.cwd ?? '', data.sessionPath ?? null, source?.title ?? runtime.defaultTitle, Date.now());
      deps.fillSessionMeta(threadId);
      return { ok: true as const, data: view };
    },
    'session/reveal': (params) => {
      if (!deps.insideSessionsRoot(params.sessionPath)) return Promise.resolve(fail(appError('session_path_forbidden')));
      deps.revealPath(params.sessionPath);
      return Promise.resolve({ ok: true as const, data: null });
    },
    'session/bash': bashRouteHandler(deps),
    'session/clearQueue': async (params) => {
      // clear_queue 响应携带被清队列文本快照（hub 先取后清）——路由契约是 null，载荷不透传
      const result = await sc().clearQueue({ threadId: params.threadId });
      return result.ok ? { ok: true as const, data: null } : fail(result.error);
    },
    'session/abortBash': async (params) => {
      const result = await sc().abortBash(params);
      return result.ok ? { ok: true as const, data: null } : fail(result.error);
    },
    'permission/mode': async (params) => {
      const result = await pc().getMode({ threadId: params.threadId });
      if (!result.ok) return fail(result.error);
      const data = result.data as { mode?: unknown; source?: unknown };
      const source = data.source;
      return {
        ok: true as const,
        data: {
          mode: typeof data.mode === 'string' ? data.mode : '',
          source: source === 'session' || source === 'project' || source === 'user' || source === 'default' ? source : 'default',
        },
      };
    },
    'permission/setMode': (params) => {
      deps.audit(`permission_mode:${params.threadId}:${params.mode}`);
      return pc()
        .setMode({ threadId: params.threadId, mode: params.mode })
        .then((result) => (result.ok ? { ok: true as const, data: null } : fail(result.error)));
    },
  };
}

function parseThinkingLevel(level: string): ThinkingLevel | null {
  return (THINKING_LEVEL_ORDER as readonly string[]).includes(level) ? (level as ThinkingLevel) : null;
}
