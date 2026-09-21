/**
 * 主机侧服务端口（T41 §1：方法注册表收进 api 包——动词实现所需的 app 服务面
 * 以结构化端口注入，electron 层实现端口；端口形状按动词实际使用面抽取，宿主
 * 服务结构满足即可（PaiRuntime 等无需改写）。api 包不 import 任何 electron 模块。
 */
import type { AgentDefinition, ApiData, ApiError, SessionRow, SessionView } from '@paiapp/contracts';

/** 运行时面（会话视图/注册表/相位/宿主重启） */
export interface RuntimePort {
  sessions(): SessionView[];
  readonly registry: { list(): SessionRow[] };
  readonly defaultTitle: string;
  readonly sessionsRoot: string;
  hostPhase(): 'starting' | 'ready' | 'restarting' | 'failed' | null;
  applyStartOutcome(threadId: string, cwd: string, sessionPath: string | null, title: string, lastActivityAt: number, trusted?: boolean): SessionView;
  removeSession(threadId: string): void;
  detachSession(threadId: string): void;
  parkSession(threadId: string): void;
  renameSession(threadId: string, name: string): void;
  touchSession(threadId: string, patch: Partial<Pick<SessionView, 'streaming' | 'model' | 'thinkingLevel' | 'state'>>): void;
  setSessionKeepalive(threadId: string, keepalive: boolean): 'ok' | 'unknown_session';
  emitBuffered(): void;
  markBootstrapped(): void;
  autoTitleOnPrompt(threadId: string, message: string): Promise<void>;
  readonly host: { restart(cause: string): Promise<void> };
  hostStderrTail(): string;
}

export type AuditPort = (message: string) => void;
export type FailPort = (error: ApiError) => { ok: false; error: ApiError };

/** agent 定义文件面（upsert/remove 返回 {ok:true}|{ok:false;reason} —— 结构满足即可） */
export interface AgentDefinitionsPort {
  list(cwds: readonly string[]): AgentDefinition[];
  upsert(definition: AgentDefinition, previous: { name: string; scope: 'user' | 'project'; project: string | null } | null, cwds: readonly string[]): { ok: true } | { ok: false; reason: string };
  remove(key: { name: string; scope: 'user' | 'project'; project: string | null }, cwds: readonly string[]): { ok: true } | { ok: false; reason: string };
}

/** 运行监视器快照面（runtime 组消费的子集） */
export interface MonitorPort {
  snapshot(): ApiData<'app/runtime'>;
}
