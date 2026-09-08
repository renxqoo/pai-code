import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { mapDialogRequest, mapSessionEvent, mapSubagentEvent, sessionFromStartResponse, threadListEntries, toSessionView } from '@paiapp/adapter';
import {
  openRegistryStore,
  createHostProcess,
  type HostProcessDeps,
} from '@paiapp/infra';
import type {
  HostPhase,
  HostProcessPort,
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
 * 挂死/手动重启后的会话恢复（按注册表逐个 thread/resume）；
 * 渲染层事件在 bootstrap 前缓冲（上限 1000，先到先丢弃）。
 */

const DEFAULT_TITLE = 'New conversation';
const EVENT_BUFFER_LIMIT = 1_000;
const READY_TIMEOUT_MS = 30_000;

export interface PaiRuntimeDeps {
  paths: AppPaths;
  keyStore: ProviderKeyStore;
  providers: () => readonly { name: string; baseUrl: string; api: string; models: readonly string[] }[];
  hubPaths: () => { bunPath: string; hubEntry: string } | null;
  logger: { log(message: string): void };
  /** 事件出口（装配层接 IPC 推送）。 */
  emit: (event: UiEvent) => void;
  timing?: HostProcessDeps['timing'];
}

export interface PaiRuntime {
  readonly host: HostProcessPort;
  /** 会话文件根目录（agentDir/sessions；session/resume 白名单基准）。 */
  readonly sessionsRoot: string;
  start(): Promise<void>;
  stop(): Promise<void>;
  sessions(): SessionView[];
  emitBuffered(): void;
  markBootstrapped(): void;
  registry: RegistryStorePort;
  defaultTitle: string;
  refreshSessionsFromHost(): Promise<void>;
  applyStartOutcome(threadId: string, cwd: string, sessionPath: string | null, title: string): SessionView;
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

  const persistSession = (view: SessionView): void => {
    registry.upsert({
      threadId: view.threadId,
      sessionPath: view.sessionPath,
      cwd: view.cwd,
      title: view.title,
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

  const resumeAll = async (): Promise<void> => {
    const active = host ?? null;
    if (active === null) return;
    for (const row of registry.list()) {
      if (row.sessionPath === null) {
        // 从未有首条消息的空会话无法恢复（无会话文件）
        registry.remove(row.threadId);
        sessions.delete(row.threadId);
        continue;
      }
      const outcome = await active.request({ type: 'thread/resume', sessionPath: row.sessionPath });
      if (!outcome.ok) {
        // 可重试失败（超时/暂时错误）保留行：下次重启/手动仍可恢复；
        // 仅会话文件缺失（不可恢复）才除名
        log(`resume_failed:${row.threadId}:${outcome.error}`);
        if (/not found|no such/i.test(outcome.error)) {
          registry.remove(row.threadId);
          sessions.delete(row.threadId);
          emit({ type: 'sessionRemoved', threadId: row.threadId });
        }
        continue;
      }
      const view = sessionFromStartOutcome(outcome.data, row.title);
      if (view === null) continue;
      // resume 可能换 id；注册表与内存表按新 id 整行替换（旧 id 视图同步清出）
      if (view.threadId !== row.threadId) {
        registry.remove(row.threadId);
        sessions.delete(row.threadId);
        emit({ type: 'sessionRemoved', threadId: row.threadId });
      }
      upsertSession({ ...view, title: row.title });
      persistSession({ ...view, title: row.title });
    }
  };

  const sessionFromStartOutcome = (data: unknown, title: string): SessionView | null => {
    const view = sessionFromStartResponse(data, title);
    if (view === null) {
      const d = typeof data === 'object' && data !== null ? (data as Record<string, unknown>) : {};
      const threadId = typeof d['threadId'] === 'string' ? d['threadId'] : '';
      if (threadId.length === 0) return null;
      return toSessionView({ threadId, cwd: typeof d['cwd'] === 'string' ? d['cwd'] : '', sessionPath: null, title });
    }
    return view;
  };

  const buildHost = (): HostProcessPort => {
    const hub = deps.hubPaths();
    if (hub === null) {
      throw new Error('hub_paths_unconfigured');
    }
    return createHostProcess({
      config: {
        bunPath: hub.bunPath,
        hubEntry: hub.hubEntry,
        agentDir: deps.paths.agentDir,
        cwd: homedir(),
        // 每次 spawn（含重启）重生成 models.json 并解析最新 key 注入
        buildEnv: () =>
          writeModelsConfig(deps.paths.agentDir, deps.providers().map((p) => ({ ...p, models: [...p.models] })), deps.keyStore).env,
      },
      onFrame: handleFrame,
      onPhase: (phase: HostPhase) => {
        log(`host_phase:${phase}`);
        emit({ type: 'host', phase });
      },
      onRestart: resumeAll,
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
      await this.refreshSessionsFromHost();
    },
    async stop(): Promise<void> {
      await host?.dispose();
      host = null;
      registry.close();
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
    async refreshSessionsFromHost(): Promise<void> {
      const active = host;
      if (active === null) return;
      const outcome = await active.request({ type: 'thread/list' });
      if (!outcome.ok) {
        log(`thread_list_failed:${outcome.error}`);
        return;
      }
      const entries = threadListEntries(outcome.data);
      const liveIds = new Set(entries.map((entry) => entry.threadId));
      // host 里存在但内存表没有（如手工恢复）：按注册表标题或路径补建
      for (const entry of entries) {
        const existing = sessions.get(entry.threadId);
        if (existing !== undefined) {
          if (existing.state !== entry.state || existing.streaming !== entry.isStreaming) {
            upsertSession({ ...existing, state: entry.state, streaming: entry.isStreaming });
          }
          continue;
        }
        const row = registry.get(entry.threadId);
        upsertSession(
          toSessionView({
            threadId: entry.threadId,
            cwd: entry.cwd,
            sessionPath: entry.sessionPath,
            state: entry.state,
            streaming: entry.isStreaming,
            title: row?.title ?? DEFAULT_TITLE,
            lastActivityAt: row?.updatedAt ?? Date.now(),
          }),
        );
      }
      // 注册表里要求恢复、但 host 里没有的会话 → resume
      for (const row of registry.list()) {
        if (liveIds.has(row.threadId) || sessions.has(row.threadId)) continue;
        if (row.sessionPath === null) continue;
        const resumeOutcome = await active.request({ type: 'thread/resume', sessionPath: row.sessionPath });
        if (!resumeOutcome.ok) {
          log(`resume_failed:${row.threadId}:${resumeOutcome.error}`);
          continue;
        }
        const view = sessionFromStartOutcome(resumeOutcome.data, row.title);
        if (view === null) continue;
        if (view.threadId !== row.threadId) registry.remove(row.threadId);
        upsertSession({ ...view, title: row.title });
        persistSession({ ...view, title: row.title });
      }
    },
    applyStartOutcome(threadId: string, cwd: string, sessionPath: string | null, title: string): SessionView {
      const view = toSessionView({ threadId, cwd, sessionPath, title, lastActivityAt: Date.now() });
      upsertSession(view);
      persistSession(view);
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

/** 启动时注册表视图兜底（host 未恢复前的侧栏占位）。 */
export function registryViews(registry: RegistryStorePort): SessionView[] {
  return registry.list().map((row) => toSessionView({ threadId: row.threadId, cwd: row.cwd, sessionPath: row.sessionPath, state: 'parked', title: row.title, lastActivityAt: row.updatedAt }));
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
