import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { mapDialogRequest, mapSessionEvent, mapSubagentEvent, savedSessions, toSessionView } from '@paiapp/adapter';
import {
  openRegistryStore,
  createHostProcess,
  type HostProcessDeps,
} from '@paiapp/infra';
import type {
  HostPhase,
  HostProcessPort,
  ProviderConfig,
  RegistryStorePort,
  SessionView,
  UiEvent,
} from '@paiapp/contracts';

import type { AppPaths } from './paths';
import type { ProviderKeyStore } from './file-settings';
import { writeModelsConfig } from './models-config';

/**
 * 主进程运行时：host 进程 + 注册表 + 会话表（SessionView 单一内存真相）。
 * 职责：帧 → UiEvent（协议语义只经 adapter）；注册表与内存表同步；
 * 启动/重启后只对账（注册表 vs 盘上会话，parked 占位渲染），会话恢复是
 * 渲染层按需发起的 session/resume（懒恢复）；渲染层事件在 bootstrap 前
 * 缓冲（上限 1000，先到先丢弃）。
 */

const DEFAULT_TITLE = 'New conversation';
const EVENT_BUFFER_LIMIT = 1_000;
const READY_TIMEOUT_MS = 30_000;

export interface PaiRuntimeDeps {
  paths: AppPaths;
  keyStore: ProviderKeyStore;
  providers: () => readonly ProviderConfig[];
  hubPaths: () => { bunPath: string; hubEntry: string } | null;
  logger: { log(message: string): void };
  /** 事件出口（装配层接 IPC 推送）。 */
  emit: (event: UiEvent) => void;
  timing?: HostProcessDeps['timing'];
  /** host 工厂注入缝（缺省 infra 实现；单测注入 fake port）。 */
  createHost?: (deps: HostProcessDeps) => HostProcessPort;
}

export interface PaiRuntime {
  readonly host: HostProcessPort;
  /** 会话文件根目录（agentDir/sessions；session/resume 白名单基准）。 */
  readonly sessionsRoot: string;
  start(): Promise<void>;
  stop(): Promise<void>;
  /** host 相位安全读取（host 未构建返回 null；bootstrap/诊断用，不抛）。 */
  hostPhase(): HostPhase | null;
  /** host stderr 尾部安全读取（host 未构建返回空串）。 */
  hostStderrTail(): string;
  sessions(): SessionView[];
  emitBuffered(): void;
  markBootstrapped(): void;
  registry: RegistryStorePort;
  defaultTitle: string;
  /** 启动/重启后的注册表对账（占位渲染，不 resume；懒恢复由渲染层发起）。 */
  reconcileSessions(): Promise<void>;
  applyStartOutcome(threadId: string, cwd: string, sessionPath: string | null, title: string, trusted?: boolean): SessionView;
  removeSession(threadId: string): void;
  renameSession(threadId: string, name: string): void;
  touchSession(threadId: string, patch: Partial<Pick<SessionView, 'streaming' | 'model' | 'thinkingLevel' | 'state'>>): void;
  autoTitleOnPrompt(threadId: string, message: string): Promise<void>;
}

export function createPaiRuntime(deps: PaiRuntimeDeps): PaiRuntime {
  const registry = openRegistryStore(deps.paths.registryDb);
  const sessions = new Map<string, SessionView>();
  const eventBuffer: UiEvent[] = [];
  let bootstrapped = false;
  let host: HostProcessPort | null = null;

  const emit = (event: UiEvent): void => {
    if (bootstrapped) {
      deps.emit(event);
      return;
    }
    eventBuffer.push(event);
    if (eventBuffer.length > EVENT_BUFFER_LIMIT) eventBuffer.shift();
  };

  const log = (message: string): void => {
    deps.logger.log(message);
  };

  const upsertSession = (view: SessionView): void => {
    sessions.set(view.threadId, view);
    emit({ type: 'sessionUpdated', session: view });
  };

  const persistSession = (view: SessionView, trusted?: boolean): void => {
    registry.upsert({
      threadId: view.threadId,
      sessionPath: view.sessionPath,
      cwd: view.cwd,
      title: view.title,
      // 未指定（缺省 resume 等同文件重开）沿用行内记录；显式指定则覆盖
      trusted: trusted ?? registry.get(view.threadId)?.trusted ?? null,
      createdAt: registry.get(view.threadId)?.createdAt ?? Date.now(),
      updatedAt: Date.now(),
    });
  };

  const applyUiEvents = (threadId: string, events: readonly UiEvent[]): void => {
    for (const event of events) {
      emit(event);
      // 事件副作用：会话表派生字段（流式/最近活动）+ 标题改名落注册表
      if (event.type === 'turnStarted') {
        const view = sessions.get(threadId);
        if (view !== undefined && !view.streaming) upsertSession({ ...view, streaming: true, lastActivityAt: event.at });
      } else if (event.type === 'turnSettled') {
        const view = sessions.get(threadId);
        if (view?.streaming) upsertSession({ ...view, streaming: false, lastActivityAt: Date.now() });
      } else if (event.type === 'sessionRenamed') {
        const view = sessions.get(threadId);
        if (view !== undefined && event.name !== null && event.name.length > 0) {
          upsertSession({ ...view, title: event.name });
          persistSession({ ...view, title: event.name });
        }
      }
    }
  };

  const handleFrame: HostProcessDeps['onFrame'] = (frame) => {
    try {
      dispatchFrame(frame);
    } catch (error) {
      // 帧处理不得击穿主进程（stdout 回调内同步执行）
      log(`frame_dispatch_error:${errorMessage(error)}`);
    }
  };

  const dispatchFrame = (frame: Parameters<HostProcessDeps['onFrame']>[0]): void => {
    switch (frame.type) {
      case 'event':
        applyUiEvents(frame.threadId, mapSessionEvent(frame.threadId, frame.event, { now: () => Date.now() }));
        return;
      case 'ui_request':
        emit(mapDialogRequest(frame));
        return;
      case 'subagent_event':
        applyUiEvents(frame.threadId, mapSubagentEvent(frame));
        return;
      case 'subagent_message':
        emit({
          type: 'subagentMessage',
          threadId: frame.threadId,
          subagentId: frame.subagentId,
          agent: frame.agent,
          text: frame.text,
          to: frame.to ?? null,
        });
        return;
      case 'thread_died': {
        const view = sessions.get(frame.threadId);
        if (view !== undefined) upsertSession({ ...view, state: 'dead' });
        emit({ type: 'sessionDied', threadId: frame.threadId, reason: frame.reason });
        return;
      }
      case 'hub_error':
        log(`hub_error:${frame.scope}:${frame.threadId ?? '-'}:${frame.error}`);
        return;
      default:
        return;
    }
  };

  /**
   * 注册表 vs 盘上会话对账（启动与 host 重启后）：不发任何 thread/resume——
   * 恢复由渲染层按需发起（懒恢复）。hub 的 list_saved 以 cwd 过滤（无 cwd =
   * host 进程 cwd，不适用），按注册表去重 cwd 逐目录列举聚合。
   */
  const reconcileSessions = async (): Promise<void> => {
    const active = host;
    if (active === null) return;
    const rows = registry.list();
    const onDisk = new Set<string>();
    const listedCwds = new Set<string>();
    for (const cwd of new Set(rows.map((row) => row.cwd).filter((value) => value.length > 0))) {
      const outcome = await active.request({ type: 'thread/list_saved', cwd });
      if (!outcome.ok) {
        // 暂态列举失败不得删行（丢恢复依据）；行保留为占位，真实缺失由 resume 失败显式暴露
        log(`list_saved_failed:${cwd}:${outcome.error}`);
        continue;
      }
      listedCwds.add(cwd);
      for (const session of savedSessions(outcome.data)) onDisk.add(session.sessionPath);
    }
    for (const row of rows) {
      if (row.sessionPath === null) {
        // 从未有首条消息的空会话无会话文件，不可恢复
        registry.remove(row.threadId);
        sessions.delete(row.threadId);
        emit({ type: 'sessionRemoved', threadId: row.threadId });
        continue;
      }
      if (listedCwds.has(row.cwd) && !onDisk.has(row.sessionPath)) {
        // 该行 cwd 列举成功且盘上无此文件：确认缺失（与 resume 失败 not-found 删行同语义）
        registry.remove(row.threadId);
        sessions.delete(row.threadId);
        emit({ type: 'sessionRemoved', threadId: row.threadId });
        continue;
      }
      upsertSession(
        toSessionView({
          threadId: row.threadId,
          cwd: row.cwd,
          sessionPath: row.sessionPath,
          state: 'parked',
          title: row.title,
          lastActivityAt: row.updatedAt,
        }),
      );
    }
  };

  const buildHost = (): HostProcessPort => {
    const hub = deps.hubPaths();
    if (hub === null) {
      throw new Error('hub_paths_unconfigured');
    }
    const factory = deps.createHost ?? createHostProcess;
    return factory({
      config: {
        bunPath: hub.bunPath,
        hubEntry: hub.hubEntry,
        agentDir: deps.paths.agentDir,
        cwd: homedir(),
        // 每次 spawn（含重启）重生成 models.json 并解析最新 key 注入
        buildEnv: () => writeModelsConfig(deps.paths.agentDir, deps.providers(), deps.keyStore).env,
      },
      onFrame: handleFrame,
      onPhase: (phase: HostPhase) => {
        log(`host_phase:${phase}`);
        emit({ type: 'host', phase });
      },
      onRestart: reconcileSessions,
      onDiagnostic: (message) => log(`host:${message}`),
      timing: deps.timing,
    });
  };

  return {
    get host(): HostProcessPort {
      if (host === null) throw new Error('runtime_not_started');
      return host;
    },
    get sessionsRoot(): string {
      return join(deps.paths.agentDir, 'sessions');
    },
    registry,
    defaultTitle: DEFAULT_TITLE,
    async start(): Promise<void> {
      const hub = deps.hubPaths();
      if (hub === null || !existsSync(hub.hubEntry)) {
        log('hub_entry_missing');
        throw new Error('hub_paths_unconfigured');
      }
      host = buildHost();
      await waitForPhase(host, 'ready', READY_TIMEOUT_MS);
      await this.reconcileSessions();
    },
    async stop(): Promise<void> {
      await host?.dispose();
      host = null;
      registry.close();
    },
    hostPhase(): HostPhase | null {
      return host?.phase ?? null;
    },
    hostStderrTail(): string {
      return host?.diagnostics().stderrTail ?? '';
    },
    sessions(): SessionView[] {
      return [...sessions.values()].sort((a, b) => b.lastActivityAt - a.lastActivityAt);
    },
    emitBuffered(): void {
      for (const event of eventBuffer.splice(0)) deps.emit(event);
    },
    markBootstrapped(): void {
      bootstrapped = true;
    },
    reconcileSessions,
    applyStartOutcome(threadId: string, cwd: string, sessionPath: string | null, title: string, trusted?: boolean): SessionView {
      const view = toSessionView({ threadId, cwd, sessionPath, title, lastActivityAt: Date.now() });
      upsertSession(view);
      persistSession(view, trusted);
      return view;
    },
    removeSession(threadId: string): void {
      sessions.delete(threadId);
      registry.remove(threadId);
      emit({ type: 'sessionRemoved', threadId });
    },
    renameSession(threadId: string, name: string): void {
      const view = sessions.get(threadId);
      if (view === undefined) return;
      upsertSession({ ...view, title: name });
      persistSession({ ...view, title: name });
    },
    touchSession(threadId: string, patch: Partial<Pick<SessionView, 'streaming' | 'model' | 'thinkingLevel' | 'state'>>): void {
      const view = sessions.get(threadId);
      if (view === undefined) return;
      upsertSession({ ...view, ...patch });
    },
    async autoTitleOnPrompt(threadId: string, message: string): Promise<void> {
      const view = sessions.get(threadId);
      if (view === undefined || view.title !== DEFAULT_TITLE) return;
      const name = message.replace(/\s+/g, ' ').trim().slice(0, 48);
      if (name.length === 0) return;
      const outcome = await this.host.request({ type: 'set_session_name', threadId, name });
      if (!outcome.ok) return;
      this.renameSession(threadId, name);
    },
  };
}

function waitForPhase(host: HostProcessPort, target: HostPhase, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    if (host.phase === target) {
      resolve();
      return;
    }
    const off = host.onPhase((phase) => {
      if (phase === target) {
        off();
        clearTimeout(failTimer);
        resolve();
      }
      if (phase === 'failed') {
        off();
        clearTimeout(failTimer);
        reject(new Error('host_failed'));
      }
    });
    const failTimer = setTimeout(() => {
      off();
      reject(new Error('host_ready_timeout'));
    }, timeoutMs);
  });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
