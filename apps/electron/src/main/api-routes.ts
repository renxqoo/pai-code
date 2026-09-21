import { realpathSync, statSync } from 'node:fs';
import { basename as baseName, dirname as dirnamePath, join as joinPaths, resolve as resolvePath, sep as pathSep } from 'node:path';

import {
  inflightView,
  mapEntries,
  modelInfos,
  pendingDialogsView,
  previewCommands,
  savedSessions,
  sessionCommands,
  sessionStatsView,
  subagentSnapshotView,
  threadStateView,
  thinkingLevelView,
} from '@paiapp/adapter';
import { createFileRead, type FileRead } from './file-read';
import { createGitBranches, type GitBranches } from './git-branches';
import { createGitGraph, type GitGraph } from './git-graph';
import { createOpenLocation, type OpenLocation } from './open-location';
import { createLocalRoutes } from './api-routes-local';
import { compactInvocationOf } from './compact-lexing';
import { createSettingsRoutes } from './api-routes-settings';
import type { AgentDefinitionsStore } from './agent-definitions-store';
import { THINKING_LEVEL_ORDER, type ThinkingLevel } from '@paiapp/contracts';
import { ApiSchemas, type ApiMethod, type ApiOutcome, type ApiParams, type ModelInfoView } from '@paiapp/contracts';

import type { PaiRuntime } from './pai-runtime';
import type { RuntimeMonitor } from './runtime-monitor/create-runtime-monitor';
import { runtimeRoutes } from './api-routes-runtime';
import { threadOpsRoutes } from './api-routes-thread-ops';
import { resumeRoutes } from './api-routes-resume';
import type { createFileSettings } from './file-settings';
import type { ProviderKeyStore } from './file-settings';

/**
 * 渲染层 invoke 路由：zod 校验 → 翻译为 host-hub 命令 → 响应收窄为视图。
 * 全部错误以 {ok:false,reason} 返回（中性英文）；协议字面量只在本文件与 adapter 出现。
 */

type FileSettings = ReturnType<typeof createFileSettings>;

/**
 * 模型清单的渠道真相域过滤：app 的唯一模型/凭据面是设置里的渠道
 * （env 清洗 + $PAI_KEY_* 注入），hub 内置目录的模型不经渠道配置不可用，
 * 不进选择面。
 */
export function channelScopedModels(
  models: readonly ModelInfoView[],
  channelNames: ReadonlySet<string>,
): ModelInfoView[] {
  return models.filter((model) => channelNames.has(model.provider));
}

export interface ApiRouteDeps {
  runtime: PaiRuntime;
  settings: FileSettings;
  keyStore: ProviderKeyStore;
  /** 审计日志（权限应答等安全敏感动作）。 */
  audit: (message: string) => void;
  /** 子 agent 定义文件面（user 目录 + 已知项目 .my-agent/agents 的 CRUD）。 */
  agentDefinitions: AgentDefinitionsStore;
  /** agentDir 根（会话根解析）。 */
  agentDir: string;
  /** 在系统文件管理器中显示文件（装配层注入 Electron shell；缺省 no-op 保可测性）。 */
  revealPath: (path: string) => void;
  /** 系统目录选择对话框（装配层注入 Electron dialog；缺省返回「不可用」）。 */
  pickDirectory: (defaultPath: string | null) => Promise<string | null>;
  /** 本地 git 分支能力（装配层可注入执行器替身；缺省走真实 git）。 */
  git?: GitBranches;
  /** 本地 git 图谱读口（同上，可注入替身）。 */
  graph?: GitGraph;
  /** 运行状态监控器（T29 app/runtime 快照源）。 */
  monitor: RuntimeMonitor;
  /** 档位 hub 同步失败落档钩子（监督日志 → 监控时间线）。 */
  onPolicySyncFailed?: (minutes: number, reason: string) => void;
  /** 路由拒绝/失败落诊断日志（api-routes 装配层接主进程 log；设置域与
   *  会话创建/投递域共用的可观测面——线上症状取证单一入口）。 */
  onRouteRejected?: (message: string) => void;
  /** 诊断包落盘（装配层注入：真实 fs + reveal；测试注入替身）。 */
  exportDiagnosticsBundle: () => string;
  /** 系统工具打开能力（访达/终端/编辑器；缺省走真实 execFile 探测）。 */
  openLocation?: OpenLocation;
  /** 项目文件只读面（代码查看器数据源；缺省走真实 fs）。 */
  fileRead?: FileRead;
  /** 额外放行的工作目录（本次运行中经系统选择器选过的目录）。 */
  extraCwds?: () => readonly string[];
}

type Outcome<M extends ApiMethod> = Promise<ApiOutcome<M>>;

export function createApiRoutes(deps: ApiRouteDeps) {
  const { runtime } = deps;

  const fail = (reason: string): { ok: false; reason: string } => ({ ok: false, reason });

  /** 会话文件白名单：resolve 后必须位于 sessionsRoot 之下（真实路径优先；缺失段
   *  逐级上溯到存在的祖先做 realpath 归一——删除后的会话目录幂等重删不得因归一
   *  失败被误拒，逃逸路径 realpath 后仍在 root 外）。 */
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
      // 目标不在：逐级上溯最近的存在的祖先（macOS /tmp→/private/tmp 符号链接归一），
      // 剩余相对段拼回——任意深度的已删路径都能归一到真实前缀域
      let dir = dirnamePath(target);
      const tail: string[] = [baseName(target)];
      for (let depth = 0; depth < 8; depth += 1) {
        try {
          const real = realpathSync(dir);
          target = tail.length > 0 ? joinPaths(real, ...tail) : real;
          break;
        } catch {
          tail.unshift(baseName(dir));
          const parent = dirnamePath(dir);
          if (parent === dir) break; // 到根仍不存在：保持 resolve 形态（多半已在白名单外）
          dir = parent;
        }
      }
    }
    return target === root || target.startsWith(`${root}${pathSep}`);
  };

  const command = async (
    cmd: Parameters<PaiRuntime['host']['request']>[0],
    timeoutMs?: number,
  ): Promise<{ ok: true; data: unknown } | { ok: false; reason: string }> => {
    try {
      const outcome = await runtime.host.request(cmd, timeoutMs);
      return outcome.ok ? { ok: true, data: outcome.data } : fail(outcome.error);
    } catch {
      // host 未启动/装配失败走 outcome 而非异常（渲染层据此进降级 UI）
      return fail('host_unavailable');
    }
  };

  /** prompt 通路：普通消息受理即回包（秒级）；行首 /compact 被 hub 拦截为同步
   * 压缩、完成才回包且无 settled——超时面分档。 */
  const PROMPT_REQUEST_TIMEOUT_MS = 10 * 60_000;
  const COMPACT_REQUEST_TIMEOUT_MS = 30 * 60_000;

  /** 按会话文件路径找注册表行（resume 缺省 trusted 的补全源）。 */
  const findRegistryRowByPath = (sessionPath: string) => runtime.registry.list().find((row) => row.sessionPath === sessionPath) ?? null;

  /** 会话文件最后写入时刻（≈ 最后活动轮次）；不可读返回 null。 */
  const fileMtimeMs = (path: string): number | null => {
    try {
      return statSync(path).mtimeMs;
    } catch {
      return null;
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

  /**
   * 目录门禁：只允许本应用已知项目目录（活跃会话 + 注册表 + 本次系统选择器选过的目录），
   * 缩小文件枚举与工作树写入面（已知目录集合本身由 session/start 决定，见 T23 挂账），
   * 不是对任意路径的硬边界；符号链接按 realpath 归一。
   */
  const isKnownCwd = (cwd: string): boolean => {
    const root = resolvePath(cwd);
    let rootReal = root;
    try {
      rootReal = realpathSync(root);
    } catch {
      // 目录不存在：保留 resolve 形态（调用侧按空结果/报错降级）
    }
    return [...knownCwds(), ...(deps.extraCwds?.() ?? [])].some((known) => {
      try {
        const base = realpathSync(known);
        return base === rootReal || rootReal.startsWith(`${base}${pathSep}`);
      } catch {
        return resolvePath(known) === root;
      }
    });
  };

  const git = deps.git ?? createGitBranches();
  const graph = deps.graph ?? createGitGraph();
  const openLocation = deps.openLocation ?? createOpenLocation();
  const fileRead = deps.fileRead ?? createFileRead();

  const savedAcrossCwds = async (cwd?: string): Promise<ReturnType<typeof savedSessions>> => {
    const targets = cwd !== undefined ? [cwd] : knownCwds();
    const merged = new Map<string, ReturnType<typeof savedSessions>[number]>();
    for (const target of targets) {
      const result = await command({ type: 'thread/list_saved', cwd: target });
      if (!result.ok) continue;
      for (const session of savedSessions(result.data, runtime.sessionsRoot)) merged.set(session.sessionPath, session);
    }
    return [...merged.values()].sort((a, b) => b.modifiedAt - a.modifiedAt);
  };

  /**
   * provider 配置变更 → 重启 host 恢复链路：hub 的模型目录只在启动时读入 providers.json，
   * 且 key 经 spawn env 注入——模型能力或 key 的任何变化都必须重 spawn 才生效。
   * host 未启动则配置已落盘，下次启动时生效。
   */
  const restartHostForProviders = async (): Promise<void> => {
    try {
      await runtime.host.restart('providers_changed');
    } catch {
      // host 未构建/未启动：落盘即完成，待下次启动时生效
    }
  };

  const localRoutes = createLocalRoutes({ isKnownCwd, audit: deps.audit, git, graph, openLocation, fileRead });
  const settings = createSettingsRoutes({
    settings: deps.settings,
    keyStore: deps.keyStore,
    restartHost: restartHostForProviders,
    command: command as Parameters<typeof createSettingsRoutes>[0]['command'],
    ...(deps.onRouteRejected !== undefined ? { onReject: deps.onRouteRejected } : {}),
  });
  const { providersView, preferencesView, skillsList } = settings;

  type RouteTable = { [M in ApiMethod]?: (params: ApiParams<M>) => Outcome<M> };


  /** 渠道真相域过滤（纯函数见模块级 channelScopedModels）：model/list 与 bootstrap 同口径。 */
  const channelModels = (models: readonly ModelInfoView[]): ModelInfoView[] =>
    channelScopedModels(models, new Set(deps.settings.listProviders().map((provider) => provider.name)));

  const routes: RouteTable = {
    ...localRoutes,
    ...settings.routes,
    ...threadOpsRoutes({
      command,
      fail,
      runtime,
      rootDeps: { audit: deps.audit, agentDefinitions: deps.agentDefinitions, knownCwds, insideSessionsRoot },
    }),
    'app/bootstrap': async () => {
      const [saved, models] = await Promise.all([savedAcrossCwds(), command({ type: 'get_models' })]);
      const outcome = {
        sessions: runtime.sessions(),
        saved,
        models: models.ok ? channelModels(modelInfos(models.data)) : [],
        providers: providersView(),
        preferences: preferencesView(),
        hostPhase: runtime.hostPhase(),
      };
      // 先冲缓冲再开门：开门后新事件直发，若先开门，await 窗口内的新事件会
      // 插队到更旧的缓冲事件之前（sessionUpdated 旧覆新）
      runtime.emitBuffered();
      runtime.markBootstrapped();
      return { ok: true as const, data: outcome };
    },
    'session/start': async (params) => {
      if (params.trusted !== undefined) deps.audit(`session_trusted:start:${params.cwd}:${params.trusted}`);
      const result = await command({
        type: 'thread/start',
        cwd: params.cwd,
        modelId: params.modelId,
        trusted: params.trusted,
        ...(params.permissionMode !== undefined ? { permissionMode: params.permissionMode } : {}),
        ...(params.thinkingLevel !== undefined ? { thinkingLevel: params.thinkingLevel } : {}),
      });
      if (!result.ok) {
        deps.onRouteRejected?.(`session_start_rejected:${result.reason}`);
        return fail(result.reason);
      }
      const data = result.data as { threadId?: string; cwd?: string; sessionPath?: string | null };
      const threadId = data.threadId ?? '';
      if (threadId.length === 0) return fail('malformed_response');
      const view = runtime.applyStartOutcome(threadId, data.cwd ?? params.cwd, data.sessionPath ?? null, runtime.defaultTitle, Date.now(), params.trusted ?? false);
      fillSessionMeta(threadId);
      return { ok: true as const, data: view };
    },
    'session/stop': async (params) => {
      const result = await command({ type: 'thread/stop', threadId: params.threadId });
      if (!result.ok) return fail(result.reason);
      // remove=false：内部重开链（trusted 重载/技能开关）只摘视图，注册表行是随后 resume 的 title/trusted 补全源
      if (params.remove) runtime.removeSession(params.threadId);
      else runtime.detachSession(params.threadId);
      return { ok: true as const, data: null };
    },
    'session/listSaved': async (params) => {
      return { ok: true as const, data: await savedAcrossCwds(params.cwd) };
    },
    'session/prompt': async (params) => {
      // /compact 词形命中 → 直发 compact 命令（D7：与 hub prompt 拦截同执行路径/同
      // 词表/同 data 三元组——app 不依赖 hub 拦截面行为对齐；响应即终态，长超时）
      const invocation = compactInvocationOf(params.message);
      if (invocation !== undefined) {
        // 携图命中命令 = hub 硬拒（invalid images: compact does not accept images）——
        // 直发路径本地同口径先拒，附件不被静默丢弃
        if ((params.images?.length ?? 0) > 0) return fail('invalid images: compact does not accept images');
        const result = await command(
          { type: 'compact', threadId: params.threadId, customInstructions: invocation.customInstructions },
          COMPACT_REQUEST_TIMEOUT_MS,
        );
        if (!result.ok) return fail(result.reason);
        void runtime.autoTitleOnPrompt(params.threadId, params.message).catch(() => undefined);
        const raw = (result.data ?? {}) as Record<string, unknown>;
        const compactResult =
          typeof raw['summary'] === 'string' && typeof raw['replacedCount'] === 'number' && typeof raw['summaryTokens'] === 'number'
            ? { summary: raw['summary'], replacedCount: raw['replacedCount'], summaryTokens: raw['summaryTokens'] }
            : null;
        return { ok: true as const, data: compactResult };
      }
      // 受理窗口竞态（hub 判定 pendingSends>0 ∨ streaming，app 的 streaming 状态来自
      // 事件流天然滞后）：恰一次自动降级重试（补 followUp），重试仍败才上抛
      const send = (behavior?: 'steer' | 'followUp') =>
        command(
          {
            type: 'prompt',
            threadId: params.threadId,
            message: params.message,
            streamingBehavior: behavior ?? params.streamingBehavior,
            images: params.images,
          },
          PROMPT_REQUEST_TIMEOUT_MS,
        );
      let result = await send();
      if (!result.ok && params.streamingBehavior === undefined && /streamingBehavior required/.test(result.reason)) {
        result = await send('followUp');
      }
      if (!result.ok) {
        deps.onRouteRejected?.(`session_prompt_rejected:${params.threadId}:${result.reason}`);
        return fail(result.reason);
      }
      void runtime.autoTitleOnPrompt(params.threadId, params.message).catch(() => undefined);
      return { ok: true as const, data: null };
    },
    'session/abort': async (params) => {
      // Esc/停止语义 = 清队列 + 停止当前轮（客户端约定）
      await command({ type: 'clear_queue', threadId: params.threadId });
      const result = await command({ type: 'abort', threadId: params.threadId });
      return result.ok ? { ok: true as const, data: null } : fail(result.reason);
    },
    'session/entries': async (params) => {
      const result = await command({ type: 'get_entries', threadId: params.threadId, since: params.since });
      // 全量兜底只认游标失效（分支变化/重恢复；hub 文案 `invalid since cursor: <seq>`）：
      // busy/timeout 等瞬态再叠一次全量拉取只会放大压力（30s 超时后再 30s）
      if (!result.ok && params.since !== undefined && /invalid since cursor/.test(result.reason)) {
        const full = await command({ type: 'get_entries', threadId: params.threadId });
        if (!full.ok) return fail(full.reason);
        return { ok: true as const, data: mapEntries(full.data) };
      }
      if (!result.ok) return fail(result.reason);
      return { ok: true as const, data: mapEntries(result.data) };
    },
    'session/inflight': async (params) => {
      const result = await command({ type: 'get_inflight', threadId: params.threadId });
      return result.ok ? { ok: true as const, data: inflightView(result.data) } : fail(result.reason);
    },
    'session/subagents': async (params) => {
      const result = await command({ type: 'get_subagents', threadId: params.threadId });
      return result.ok ? { ok: true as const, data: { subagents: subagentSnapshotView(result.data) } } : fail(result.reason);
    },
    'session/pendingDialogs': async (params) => {
      const result = await command({ type: 'get_pending_dialogs', threadId: params.threadId });
      return result.ok ? { ok: true as const, data: { dialogs: pendingDialogsView(result.data) } } : fail(result.reason);
    },
    'session/state': async (params) => {
      const result = await command({ type: 'get_state', threadId: params.threadId });
      if (!result.ok) return fail(result.reason);
      const view = threadStateView(result.data);
      runtime.touchSession(params.threadId, { model: view.model === null ? null : `${view.model.provider}/${view.model.model}` });
      return { ok: true as const, data: view };
    },
    'session/stats': async (params) => {
      const result = await command({ type: 'get_session_stats', threadId: params.threadId });
      return result.ok ? { ok: true as const, data: sessionStatsView(result.data) } : fail(result.reason);
    },
    'session/setName': async (params) => {
      // parked 占位未进 host（setName 必回 Unknown threadId）：标题直接落注册表，
      // resume 路由按注册表行保留；hub 会话文件名待下次 live 重命名同步
      const parked = runtime.sessions().find((session) => session.threadId === params.threadId && session.state === 'parked') !== undefined;
      if (parked) {
        runtime.renameSession(params.threadId, params.name);
        return { ok: true as const, data: null };
      }
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
      const result = await command({ type: 'get_thinking_level', threadId: params.threadId });
      return result.ok ? { ok: true as const, data: thinkingLevelView(result.data) } : fail(result.reason);
    },
    'model/list': async () => {
      const result = await command({ type: 'get_models' });
      return result.ok ? { ok: true as const, data: channelModels(modelInfos(result.data)) } : fail(result.reason);
    },
    'dialog/respond': async (params) => {
      // 任何情况下都必答（晚到/未知 id 由 host 静默忽略并 ack）；权限应答落审计日志
      const confirmed = params.payload['confirmed'] === true;
      const cancelled = params.payload['cancelled'] === true;
      deps.audit(`dialog_respond:${params.requestId}:${cancelled ? 'cancelled' : confirmed ? 'confirmed' : 'value'}`);
      const result = await command({ type: 'ui_response', requestId: params.requestId, payload: params.payload });
      return result.ok ? { ok: true as const, data: null } : fail(result.reason);
    },
    'subagent/steer': async (params) => {
      const result = await command({ type: 'subagent/steer', threadId: params.threadId, agentId: params.agentId, message: params.message });
      return result.ok ? { ok: true as const, data: null } : fail(result.reason);
    },
    'command/list': async (params) => {
      const result = await command({ type: 'get_commands', threadId: params.threadId });
      return result.ok ? { ok: true as const, data: sessionCommands(result.data) } : fail(result.reason);
    },
    'command/preview': async () => {
      const enabled = (await skillsList()).filter((skill) => skill.enabled);
      return { ok: true as const, data: previewCommands(enabled) };
    },
    'agent/definitions': () => {
      // 管理面走主进程文件面（不经 hub：需要 systemPrompt 原文与全部已知项目的定义）
      return Promise.resolve({ ok: true as const, data: deps.agentDefinitions.list(knownCwds()) });
    },
    'session/fork': async (params) => {
      const result = await command({ type: 'fork', threadId: params.threadId, seq: params.seq, position: params.position });
      if (!result.ok) return fail(result.reason);
      const data = result.data as { threadId?: string; previousThreadId?: string; sessionPath?: string | null };
      const threadId = data.threadId ?? '';
      // previousThreadId 必须就是被分叉的会话：换轨响应对不上请求即坏形状（防 ABA）
      if (threadId.length === 0 || data.previousThreadId !== params.threadId) return fail('malformed_response');
      // 响应不带 cwd/标题：从被分叉会话继承（项目分组与侧栏语义跟原会话走）
      const source = runtime.sessions().find((session) => session.threadId === params.threadId);
      // fork 是原地换轨：旧 id 已从 hub 移除（会话文件保留、可懒恢复），旧行转 parked
      runtime.parkSession(params.threadId);
      const view = runtime.applyStartOutcome(threadId, source?.cwd ?? '', data.sessionPath ?? null, source?.title ?? runtime.defaultTitle, Date.now());
      fillSessionMeta(threadId);
      return { ok: true as const, data: view };
    },
    'session/reveal': (params) => {
      if (!insideSessionsRoot(params.sessionPath)) return Promise.resolve(fail('session_path_forbidden'));
      deps.revealPath(params.sessionPath);
      return Promise.resolve({ ok: true as const, data: null });
    },
    'dialog/pickDirectory': (params) =>
      deps
        .pickDirectory(params.defaultPath ?? null)
        .then((directory) => ({ ok: true as const, data: directory }))
        .catch(() => fail('dialog_unavailable')),
    'session/clearQueue': async (params) => {
      const result = await command({ type: 'clear_queue', threadId: params.threadId });
      return result.ok ? { ok: true as const, data: null } : fail(result.reason);
    },
    'session/bash': async (params) => {
      deps.audit(`bash_run:${params.threadId}`);
      // hub bash 完成才回包（墙钟上限 24h）：30s 缺省超时会误报仍在执行的命令
      const result = await command({ type: 'bash', threadId: params.threadId, command: params.command }, 24 * 60 * 60 * 1_000);
      if (!result.ok) return fail(result.reason);
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
    },
    'session/abortBash': async (params) => {
      // 全量中止语义（D13：bash 执行 id = 命令关联 id，app 侧不可定向指定）
      const result = await command({ type: 'abort_bash', threadId: params.threadId });
      return result.ok ? { ok: true as const, data: null } : fail(result.reason);
    },
    'permission/mode': async (params) => {
      const result = await command({ type: 'permission/get_mode', threadId: params.threadId });
      if (!result.ok) return fail(result.reason);
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
      return command({ type: 'permission/set_mode', threadId: params.threadId, mode: params.mode }).then((result) =>
        result.ok ? { ok: true as const, data: null } : fail(result.reason),
      );
    },
        ...runtimeRoutes({ runtime, monitor: deps.monitor, settings: deps.settings, command, fail, onPolicySyncFailed: deps.onPolicySyncFailed, exportDiagnosticsBundle: deps.exportDiagnosticsBundle }),
    'app/restartHost': () => {
      deps.audit('restart_host:manual');
      if (runtime.hostPhase() === null) return Promise.resolve(fail('host_unavailable'));
      void runtime.host.restart('manual').catch(() => undefined);
      return Promise.resolve({ ok: true as const, data: null });
    },
  };

  /** start/resume 后补齐模型与思考档信息（失败不打断主流程）。 */
  const fillSessionMeta = (threadId: string): void => {
    void routes['session/state']?.({ threadId }).catch(() => undefined);
  };

  const resume = resumeRoutes({ command, fail, runtime, audit: deps.audit, insideSessionsRoot, findRegistryRowByPath, fileMtimeMs, fillSessionMeta });
  // 挂载在表字面量之后：resume 组依赖 fillSessionMeta，而它引用本表（调用期解引用，安全）
  Object.assign(routes, resume);

  function parseThinkingLevel(level: string): ThinkingLevel | null {
    return (THINKING_LEVEL_ORDER as readonly string[]).includes(level) ? (level as ThinkingLevel) : null;
  }

  return {
    async invoke(method: string, params: unknown): Promise<unknown> {
      // 自有属性判定：原型链键（toString/__proto__）不得命中 schema（误报 invalid_params）
      if (!Object.prototype.hasOwnProperty.call(ApiSchemas, method)) return fail(`unknown_method:${method}`);
      const schema = ApiSchemas[method as ApiMethod];
      if (schema === undefined) return fail(`unknown_method:${method}`);
      let parsed: unknown;
      try {
        parsed = schema.params.parse(params);
      } catch {
        return fail('invalid_params');
      }
      let outcome: unknown;
      try {
        const handler = routes[method as ApiMethod];
        if (handler === undefined) return fail(`unknown_method:${method}`);
        outcome = await handler(parsed as never);
      } catch {
        // 路由实现内未捕获的异常（磁盘错/装配面）统一收窄，不沿 IPC reject 到渲染层
        outcome = fail('internal_error');
      }
      return outcome;
    },

    providersView,
  };
}
