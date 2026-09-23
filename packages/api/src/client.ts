/**
 * 渲染层类型化代理（T41 §1：UI→api→hub，进程边界是 transport 注入细节）。
 * 收口断言：渲染层零 IPC 方法名字面量——方法名运行时居所仅三处注册点
 * （contracts ApiSchemas 注册表 / verbs 路由表键 / 本文件 client 代理）；
 * 参数/应答类型全部从 contracts ApiSchemas 泛型抽取——zod 校验单点仍在主进程
 * 注册表，本层只做类型化调用面。域划分与 ApiMethod 闭集一一对照（词表漂移
 * 由 __test__/client.test.ts 映射断言钉住）。
 */
import type { ApiData, ApiMethod, ApiOutcome, ApiParams } from '@paiapp/contracts';

/** 代理传输面（preload 桥注入） */
export interface ApiClientTransport {
  invoke<M extends ApiMethod>(method: M, params: ApiParams<M>): Promise<ApiOutcome<M>>;
}

type Call<M extends ApiMethod> = (params: ApiParams<M>) => Promise<ApiOutcome<M>>;

function call<M extends ApiMethod>(transport: ApiClientTransport, method: M): Call<M> {
  return (params) => transport.invoke(method, params);
}

function domain<T extends Record<string, Call<ApiMethod>>>(methods: T): Readonly<T> {
  return Object.freeze(methods);
}

export interface ApiClient {
  readonly session: ReturnType<typeof createSessionDomain>;
  readonly thread: ReturnType<typeof createThreadDomain>;
  readonly models: ReturnType<typeof createModelsDomain>;
  readonly agents: ReturnType<typeof createAgentsDomain>;
  readonly skills: ReturnType<typeof createSkillsDomain>;
  readonly dialog: ReturnType<typeof createDialogDomain>;
  readonly files: ReturnType<typeof createFilesDomain>;
  readonly git: ReturnType<typeof createGitDomain>;
  readonly provider: ReturnType<typeof createProviderDomain>;
  readonly permission: ReturnType<typeof createPermissionDomain>;
  readonly command: ReturnType<typeof createCommandDomain>;
  readonly app: ReturnType<typeof createAppDomain>;
}

function createSessionDomain(t: ApiClientTransport) {
  return domain({
    prompt: call(t, 'session/prompt'),
    abort: call(t, 'session/abort'),
    abortBash: call(t, 'session/abortBash'),
    bash: call(t, 'session/bash'),
    clearQueue: call(t, 'session/clearQueue'),
    queueDrop: call(t, 'session/queueDrop'),
    queueSendNow: call(t, 'session/queueSendNow'),
    entries: call(t, 'session/entries'),
    inflight: call(t, 'session/inflight'),
    pendingDialogs: call(t, 'session/pendingDialogs'),
    subagents: call(t, 'session/subagents'),
    stats: call(t, 'session/stats'),
    tokenAnalytics: call(t, 'session/tokenAnalytics'),
    state: call(t, 'session/state'),
    listSaved: call(t, 'session/listSaved'),
    delete: call(t, 'session/delete'),
    register: call(t, 'session/register'),
    retire: call(t, 'session/retire'),
    forceRetire: call(t, 'session/forceRetire'),
    reveal: call(t, 'session/reveal'),
    setKeepalive: call(t, 'session/setKeepalive'),
    setName: call(t, 'session/setName'),
    setModel: call(t, 'session/setModel'),
    setThinking: call(t, 'session/setThinking'),
    thinkingLevels: call(t, 'session/thinkingLevels'),
    steer: call(t, 'subagent/steer'),
  });
}

function createThreadDomain(t: ApiClientTransport) {
  return domain({
    start: call(t, 'session/start'),
    resume: call(t, 'session/resume'),
    stop: call(t, 'session/stop'),
    fork: call(t, 'session/fork'),
  });
}

function createModelsDomain(t: ApiClientTransport) {
  return domain({ list: call(t, 'model/list') });
}

function createAgentsDomain(t: ApiClientTransport) {
  return domain({
    definitions: call(t, 'agent/definitions'),
    upsert: call(t, 'agent/upsert'),
    remove: call(t, 'agent/remove'),
  });
}

function createSkillsDomain(t: ApiClientTransport) {
  return domain({
    list: call(t, 'skills/list'),
    setEnabled: call(t, 'skills/setEnabled'),
    candidates: call(t, 'skills/candidates'),
    import: call(t, 'skills/import'),
    remove: call(t, 'skills/remove'),
  });
}

function createDialogDomain(t: ApiClientTransport) {
  return domain({
    pickDirectory: call(t, 'dialog/pickDirectory'),
    respond: call(t, 'dialog/respond'),
  });
}

function createFilesDomain(t: ApiClientTransport) {
  return domain({
    read: call(t, 'file/read'),
    search: call(t, 'file/search'),
  });
}

function createGitDomain(t: ApiClientTransport) {
  return domain({
    branches: call(t, 'git/branches'),
    checkout: call(t, 'git/checkout'),
    graph: call(t, 'git/graph'),
  });
}

function createProviderDomain(t: ApiClientTransport) {
  return domain({
    upsert: call(t, 'provider/upsert'),
    remove: call(t, 'provider/remove'),
    test: call(t, 'provider/test'),
  });
}

function createPermissionDomain(t: ApiClientTransport) {
  return domain({
    mode: call(t, 'permission/mode'),
    setMode: call(t, 'permission/setMode'),
  });
}

function createCommandDomain(t: ApiClientTransport) {
  return domain({
    list: call(t, 'command/list'),
    preview: call(t, 'command/preview'),
  });
}

function createAppDomain(t: ApiClientTransport) {
  return domain({
    bootstrap: call(t, 'app/bootstrap'),
    diagnosticLog: call(t, 'app/diagnosticLog'),
    exportDiagnostics: call(t, 'app/exportDiagnostics'),
    hubSettings: call(t, 'app/hubSettings'),
    setHubSettings: call(t, 'app/setHubSettings'),
    restartHost: call(t, 'app/restartHost'),
    runtime: call(t, 'app/runtime'),
    setIdleRecycle: call(t, 'app/setIdleRecycle'),
    setPreference: call(t, 'app/setPreference'),
    openShell: call(t, 'shell/open'),
  });
}

export function createApiClient(transport: ApiClientTransport): ApiClient {
  return Object.freeze({
    session: createSessionDomain(transport),
    thread: createThreadDomain(transport),
    models: createModelsDomain(transport),
    agents: createAgentsDomain(transport),
    skills: createSkillsDomain(transport),
    dialog: createDialogDomain(transport),
    files: createFilesDomain(transport),
    git: createGitDomain(transport),
    provider: createProviderDomain(transport),
    permission: createPermissionDomain(transport),
    command: createCommandDomain(transport),
    app: createAppDomain(transport),
  });
}

export type { ApiData, ApiMethod, ApiOutcome, ApiParams };
