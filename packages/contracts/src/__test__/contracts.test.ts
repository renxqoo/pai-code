import { describe, expect, test } from 'bun:test';
import {
  HUB_COMMAND_TYPES,
  HUB_FRAME_TYPES,
  PAI_COMMAND_TYPES,
  UI_EVENT_TYPES,
  UiEventSchema,
  SessionViewSchema,
  SettingsSchema,
  ApiSchemas,
  API_METHODS,
  ProviderConfigViewSchema,
  HistoryItemSchema,
  isValidAgentName,
  type HubCommand,
  type PaiCommand,
  type UiEvent,
} from '../index';

const byStr = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

describe('词表封闭（双向）', () => {
  test('UI 事件词表与 schema 判别值一致', () => {
    const samples = samplePerUiEvent();
    for (const e of samples) {
      expect(UI_EVENT_TYPES).toContain(e.type);
      expect(UiEventSchema.parse(e)).toEqual(e);
    }
    const schemaTypes = new Set(samples.map((e) => e.type));
    expect([...schemaTypes].sort(byStr)).toEqual([...UI_EVENT_TYPES].sort(byStr));
  });

  test('未知 UiEvent 类型被拒绝', () => {
    expect(() => UiEventSchema.parse({ type: 'nope', threadId: 't1' })).toThrow();
  });

  test('hub 帧词表 == 九类（v0.5 + v0.13 thread_parked）', () => {
    expect([...HUB_FRAME_TYPES].sort(byStr)).toEqual(
      ['event', 'heartbeat', 'hub_error', 'response', 'thread_died', 'thread_parked', 'ui_request', 'subagent_event', 'subagent_message'].sort(byStr),
    );
  });

  test('hub 命令词表 == 46（v0.5 + v0.6-v0.9 补齐 + v0.12 thread/register + v0.13 观测三命令 + v0.14 收敛三命令）', () => {
    expect(HUB_COMMAND_TYPES.length).toBe(46);
    expect([...HUB_COMMAND_TYPES].sort(byStr)).toEqual(
      [
        'thread/start', 'thread/resume', 'thread/register', 'thread/stop', 'thread/retire', 'thread/set_keepalive', 'thread/list', 'thread/list_saved',
        'set_model_override', 'get_host_info', 'set_idle_retire_ms', 'get_sandbox_state',
        'prompt', 'steer', 'follow_up', 'abort', 'clear_queue', 'compact',
        'get_state', 'get_messages', 'get_entries', 'get_tree', 'get_session_stats', 'set_session_name', 'get_commands', 'get_fork_messages',
        'get_inflight', 'get_subagents', 'get_pending_dialogs',
        'fork', 'clone', 'navigate_tree',
        'get_models', 'set_model', 'set_thinking_level', 'get_thinking_levels',
        'auth/list', 'auth/set_api_key', 'auth/remove_key',
        'bash', 'abort_bash',
        'ui_response',
        'subagent/steer',
        'get_permission_rules', 'set_permission_rules',
        'agents/list',
      ].sort(byStr),
    );
  });

  test('Pai 命令词表是 hub 命令词表的子集', () => {
    for (const t of PAI_COMMAND_TYPES) {
      expect(HUB_COMMAND_TYPES).toContain(t);
    }
  });

  test('Pai 不发送 compact 命令（压缩经 prompt 通路的 /compact 拦截表达；hub 协议命令词表仍全量镜像）', () => {
    expect(PAI_COMMAND_TYPES).not.toContain('compact');
    expect(HUB_COMMAND_TYPES).toContain('compact');
  });

  test('命令词表类型级校验：PaiCommand 可赋给 HubCommand 的 type 集', () => {
    const all: HubCommand['type'][] = [...HUB_COMMAND_TYPES];
    const pai: PaiCommand['type'][] = [...PAI_COMMAND_TYPES];
    for (const t of pai) expect(all).toContain(t);
    expect(all.length).toBe(HUB_COMMAND_TYPES.length);
  });

  test('API 方法词表与 schema 注册表一致', () => {
    expect([...API_METHODS].sort(byStr)).toEqual(Object.keys(ApiSchemas).sort(byStr));
  });
});

describe('Settings zod：round-trip 与拒绝表', () => {
  test('空输入落到默认值', () => {
    const s = SettingsSchema.parse({});
    expect(s.providers).toEqual([]);
    expect(s.trustedDefault).toBe(false);
    expect(s.hubDev).toEqual({ bunPath: null, hubEntry: null });
    expect(s.defaultModel).toBeNull();
    expect(s.onboarded).toBe(false);
  });

  test('全量字段 round-trip', () => {
    const input = {
      hubDev: { bunPath: '/usr/local/bin/bun', hubEntry: '/Users/x/pi/app/dist/cli.js' },
      providers: [{ name: 'glm', baseUrl: 'https://api.example.com', api: 'openai-completions', models: [{ id: 'glm-5.3', reasoning: true, vision: true }], thinkingFormat: 'zai' }],
      trustedDefault: true,
      defaultModel: 'glm/glm-5.3',
      onboarded: true,
      projectModels: { '/w': 'glm/glm-5.3' },
      pinnedSessions: ['/a.jsonl'],
      hiddenProjects: ['/w/gone'],
      idleRecycleMinutes: 15,
      archivedSessions: ['/b.jsonl'],
    };
    expect(SettingsSchema.parse(input)).toEqual(input);
  });

  test.each([
    ['未知键', { extra: 1 } as Record<string, unknown>],
    ['provider 空 models', { providers: [{ name: 'p', baseUrl: 'u', api: 'openai-completions', models: [] }] }],
    ['provider 缺 baseUrl', { providers: [{ name: 'p', api: 'openai-completions', models: ['m'] }] }],
  ])('拒绝：%s', (_name, bad) => {
    expect(() => SettingsSchema.parse(bad)).toThrow();
  });
});

describe('SessionView / HistoryItem schema', () => {
  test('SessionView 合法样本 round-trip', () => {
    const view = {
      threadId: 't1',
      cwd: '/w',
      sessionPath: null,
      title: 'New conversation',
      state: 'live',
      streaming: false,
      model: null,
      thinkingLevel: null,
      lastActivityAt: 1,
    };
    expect(SessionViewSchema.parse(view)).toEqual(view);
  });

  test('HistoryItem 三形态样本', () => {
    const items = [
      { kind: 'user', id: 'm1', text: 'hi', origin: 'user', images: [{ type: 'image', data: 'aGk=', mimeType: 'image/png' }], at: 1 },
      {
        kind: 'assistant',
        id: 'm2',
        messageTs: 2,
        at: 2,
        text: 'hello',
        thinking: '',
        toolCalls: [{ id: 'tc1', name: 'bash', argsPreview: 'ls', output: 'a\nb', isError: false, diff: null }],
        usage: { input: 10, output: 5 },
        stopReason: null,
        errorMessage: null,
      },
      { kind: 'bash', id: 'm3', command: 'git status', output: 'ok', exitCode: 0, cancelled: false, at: 3 },
    ] as const;
    for (const item of items) expect(HistoryItemSchema.parse(item)).toEqual(item);
  });

  test('HistoryItem assistant 异常终态：stopReason 仅收窄词表、error 可带原始信息', () => {
    const base = { kind: 'assistant', id: 'm2', messageTs: 2, at: 2, text: '', thinking: '', toolCalls: [], usage: null } as const;
    expect(HistoryItemSchema.parse({ ...base, stopReason: 'error', errorMessage: '401 invalid api key' })).toMatchObject({ stopReason: 'error', errorMessage: '401 invalid api key' });
    expect(HistoryItemSchema.parse({ ...base, stopReason: 'aborted', errorMessage: null })).toMatchObject({ stopReason: 'aborted' });
    expect(() => HistoryItemSchema.parse({ ...base, stopReason: 'stop', errorMessage: null })).toThrow();
  });

  test('HistoryItem 拒绝未知 origin', () => {
    expect(() => HistoryItemSchema.parse({ kind: 'user', id: 'm1', text: 'x', origin: 'other' })).toThrow();
  });
});

describe('API schema：每方法合法/非法样本', () => {
  test('session/start 合法样本通过', () => {
    const r = ApiSchemas['session/start'].params.parse({ cwd: '/tmp/w' });
    expect(r).toEqual({ cwd: '/tmp/w' });
  });

  test('app/setPreference 部分写合法：单字段与清空默认模型', () => {
    expect(ApiSchemas['app/setPreference'].params.parse({ onboarded: true })).toEqual({ onboarded: true });
    expect(ApiSchemas['app/setPreference'].params.parse({ defaultModel: null })).toEqual({ defaultModel: null });
  });

  test('provider/test 合法样本通过', () => {
    expect(ApiSchemas['provider/test'].params.parse({ name: 'glm' })).toEqual({ name: 'glm' });
  });

  test('command/list 合法样本通过', () => {
    expect(ApiSchemas['command/list'].params.parse({ threadId: 't1' })).toEqual({ threadId: 't1' });
  });

  test('session/prompt 携带 images 合法；畸形 image 拒绝', () => {
    const ok = ApiSchemas['session/prompt'].params.parse({
      threadId: 't',
      message: 'hi',
      images: [{ type: 'image', data: 'aGk=', mimeType: 'image/png' }],
    });
    expect(ok.images?.length).toBe(1);
    expect(() =>
      ApiSchemas['session/prompt'].params.parse({ threadId: 't', message: 'hi', images: [{ type: 'image', data: '', mimeType: 'image/png' }] }),
    ).toThrow();
    expect(() =>
      ApiSchemas['session/prompt'].params.parse({ threadId: 't', message: 'hi', images: [{ type: 'file', data: 'x', mimeType: 'text/plain' }] }),
    ).toThrow();
  });

  test('session/prompt 纯图消息（message 空但带 images）过闸；文本图片全空拒绝', () => {
    // fork 重试带图消息的形态：hub 协议不要求 message 非空
    const imageOnly = ApiSchemas['session/prompt'].params.parse({
      threadId: 't',
      message: '',
      images: [{ type: 'image', data: 'aGk=', mimeType: 'image/png' }],
    });
    expect(imageOnly.message).toBe('');
    expect(() => ApiSchemas['session/prompt'].params.parse({ threadId: 't', message: '' })).toThrow();
    expect(() => ApiSchemas['session/prompt'].params.parse({ threadId: 't', message: '', images: [] })).toThrow();
  });

  test('session/bash 与 abortBash 样本', () => {
    expect(ApiSchemas['session/bash'].params.parse({ threadId: 't', command: 'git status' })).toEqual({ threadId: 't', command: 'git status' });
    expect(() => ApiSchemas['session/bash'].params.parse({ threadId: 't', command: '' })).toThrow();
    expect(ApiSchemas['session/abortBash'].params.parse({ threadId: 't' })).toEqual({ threadId: 't' });
  });

  test('session/fork 与 clearQueue 样本', () => {
    expect(ApiSchemas['session/fork'].params.parse({ threadId: 't', entryId: 'e1' })).toEqual({ threadId: 't', entryId: 'e1' });
    expect(ApiSchemas['session/fork'].params.parse({ threadId: 't', entryId: 'e1', position: 'at' })).toEqual({ threadId: 't', entryId: 'e1', position: 'at' });
    expect(() => ApiSchemas['session/fork'].params.parse({ threadId: 't', entryId: '', position: 'after' })).toThrow();
    expect(ApiSchemas['session/clearQueue'].params.parse({ threadId: 't' })).toEqual({ threadId: 't' });
  });

  test('file/search 合法样本与拒绝', () => {
    expect(ApiSchemas['file/search'].params.parse({ cwd: '/w', query: 'ap' })).toEqual({ cwd: '/w', query: 'ap' });
    expect(() => ApiSchemas['file/search'].params.parse({ cwd: '', query: '' })).toThrow();
    expect(() => ApiSchemas['file/search'].params.parse({ cwd: '/w' })).toThrow();
  });

  test('isValidAgentName：文件名安全必要集（空格/Unicode 放行，分隔符/禁字符/首尾空白拒绝）', () => {
    expect(isValidAgentName('code reviewer')).toBe(true);
    expect(isValidAgentName('代码审查员')).toBe(true);
    expect(isValidAgentName('a-b_c.d')).toBe(true);
    expect(isValidAgentName('x'.repeat(64))).toBe(true);
    for (const bad of ['', 'a/b', 'a\\b', 'a:b', 'a*b', 'a?b', 'a"b', 'a<b', 'a>b', 'a|b', '.hidden', 'trailing ', ' lead', 'x'.repeat(65), 'a\u0000b']) {
      expect(isValidAgentName(bad)).toBe(false);
    }
  });

  test('provider/upsert 模型参数全链合法：contextWindow/maxTokens 随条目通过，回读视图同构（回归：IPC strict 层曾剥掉新字段）', () => {
    const params = ApiSchemas['provider/upsert'].params.parse({
      name: 'glm',
      baseUrl: 'https://x.example.com',
      api: 'openai-completions',
      models: [
        { id: 'tuned', reasoning: true, vision: true, contextWindow: 200000, maxTokens: 8192 },
        { id: 'defaulted', reasoning: false, vision: false },
      ],
    });
    expect(params.models[0]).toEqual({ id: 'tuned', reasoning: true, vision: true, contextWindow: 200000, maxTokens: 8192 });
    expect(params.models[1]).toEqual({ id: 'defaulted', reasoning: false, vision: false });
    const view = ProviderConfigViewSchema.parse({
      name: 'glm',
      baseUrl: 'https://x.example.com',
      api: 'openai-completions',
      models: params.models,
      thinkingFormat: 'default',
      hasKey: false,
    });
    expect(view.models[0]?.contextWindow).toBe(200000);
    expect(view.models[0]?.maxTokens).toBe(8192);
  });

  test('provider/test 指定模型：modelId 合法通过且可缺省；空串与未知键拒绝', () => {
    expect(ApiSchemas['provider/test'].params.parse({ name: 'glm', modelId: 'glm-4.7' })).toEqual({ name: 'glm', modelId: 'glm-4.7' });
    expect(ApiSchemas['provider/test'].params.parse({ name: 'glm' })).toEqual({ name: 'glm' });
    expect(() => ApiSchemas['provider/test'].params.parse({ name: 'glm', modelId: '' })).toThrow();
    expect(() => ApiSchemas['provider/test'].params.parse({ name: 'glm', nope: 1 })).toThrow();
  });

  test('agent 定义管理三方法：definitions 空 params；upsert/remove 键位校验', () => {
    const definition = { name: 'search', description: 'd', systemPrompt: 'p', tools: null, model: null, scope: 'user', project: null };
    expect(ApiSchemas['agent/definitions'].params.parse({})).toEqual({});
    expect(ApiSchemas['agent/upsert'].params.parse({ definition, previous: null })).toEqual({ definition, previous: null });
    expect(ApiSchemas['agent/upsert'].params.parse({ definition, previous: { file: 'old', scope: 'user', project: null } }).previous).toEqual({ file: 'old', scope: 'user', project: null });
    expect(ApiSchemas['agent/remove'].params.parse({ file: 'search', scope: 'project', project: '/w' })).toEqual({ file: 'search', scope: 'project', project: '/w' });
  });

  test.each([
    ['session/start 缺 cwd', 'session/start', {}],
    ['session/start 未知键', 'session/start', { cwd: '/w', nope: 1 }],
    ['dialog/respond 缺 payload', 'dialog/respond', { requestId: 'r1' }],
    ['app/setPreference 空 patch（empty_preference）', 'app/setPreference', {}],
    ['app/setPreference 未知键', 'app/setPreference', { nope: 1 }],
    ['provider/test 空 name', 'provider/test', { name: '' }],
    ['command/list 缺 threadId', 'command/list', {}],
    ['command/list 未知键', 'command/list', { threadId: 't', nope: 1 }],
    ['agent/upsert 未知键', 'agent/upsert', { definition: { name: 'a', description: 'd', systemPrompt: 'p', tools: null, model: null, scope: 'user', project: null }, previous: null, nope: 1 }],
    ['agent/remove 非法 scope', 'agent/remove', { file: 'a', scope: 'global', project: null }],
    ['session/prompt 空消息', 'session/prompt', { threadId: 't', message: '' }],
    ['session/prompt 非法 streamingBehavior', 'session/prompt', { threadId: 't', message: 'hi', streamingBehavior: 'queue' }],
    ['provider/upsert 空 models', 'provider/upsert', { name: 'p', baseUrl: 'u', api: 'openai-completions', models: [] }],
    ['provider/upsert 旧形态 string models', 'provider/upsert', { name: 'p', baseUrl: 'u', api: 'openai-completions', models: ['m'] }],
    ['provider/upsert 非法思考形态', 'provider/upsert', { name: 'p', baseUrl: 'u', api: 'openai-completions', models: [{ id: 'm', reasoning: true }], thinkingFormat: 'chat-template' }],
    ['dialog/pickDirectory 未知键', 'dialog/pickDirectory', { defaultPath: '/w', extra: 1 }],
    ['dialog/pickDirectory 空 defaultPath', 'dialog/pickDirectory', { defaultPath: '' }],
    ['git/branches 缺 cwd', 'git/branches', {}],
    ['git/branches 空 cwd', 'git/branches', { cwd: '' }],
    ['git/branches 未知键', 'git/branches', { cwd: '/w', extra: 1 }],
    ['git/checkout 缺 cwd', 'git/checkout', { branch: 'main' }],
    ['git/checkout 空 cwd', 'git/checkout', { cwd: '', branch: 'main' }],
    ['git/checkout 空 branch', 'git/checkout', { cwd: '/w', branch: '' }],
    ['git/checkout 非法 create 类型', 'git/checkout', { cwd: '/w', branch: 'main', create: 'yes' }],
    ['git/checkout 未知键', 'git/checkout', { cwd: '/w', branch: 'main', extra: 1 }],
  ])('拒绝：%s', (_name: string, method: string, bad: unknown) => {
    expect(() => ApiSchemas[method as keyof typeof ApiSchemas].params.parse(bad)).toThrow();
  });
});

describe('dialog/pickDirectory 契约（新会话目录选择）', () => {
  test.each([
    ['空对象', {}],
    ['带 defaultPath', { defaultPath: '/w/proj' }],
  ])('合法：%s → result 为 string|null', (_name: string, params: unknown) => {
    const parsed = ApiSchemas['dialog/pickDirectory'].params.parse(params);
    expect(parsed).toEqual(params);
    expect(ApiSchemas['dialog/pickDirectory'].result.nullable().parse(null)).toBeNull();
    expect(ApiSchemas['dialog/pickDirectory'].result.parse('/w/proj')).toBe('/w/proj');
  });
});

describe('git 分支契约（新建任务页项目/分支选择）', () => {
  test('git/branches 参数与空形态结果', () => {
    expect(ApiSchemas['git/branches'].params.parse({ cwd: '/w/proj' })).toEqual({ cwd: '/w/proj' });
    const empty = ApiSchemas['git/branches'].result.parse({ isRepo: false, current: null, branches: [] });
    expect(empty).toEqual({ isRepo: false, current: null, branches: [] });
    expect(ApiSchemas['git/branches'].result.parse({ isRepo: true, current: 'main', branches: ['dev', 'main'] })).toEqual({
      isRepo: true,
      current: 'main',
      branches: ['dev', 'main'],
    });
    expect(() => ApiSchemas['git/branches'].result.parse({ isRepo: true, current: null })).toThrow();
  });

  test('git/checkout create 缺省为 false，结果只含 branch', () => {
    expect(ApiSchemas['git/checkout'].params.parse({ cwd: '/w/proj', branch: 'main' })).toEqual({
      cwd: '/w/proj',
      branch: 'main',
      create: false,
    });
    expect(ApiSchemas['git/checkout'].params.parse({ cwd: '/w/proj', branch: 'feat/x', create: true })).toEqual({
      cwd: '/w/proj',
      branch: 'feat/x',
      create: true,
    });
    expect(ApiSchemas['git/checkout'].result.parse({ branch: 'feat/x' })).toEqual({ branch: 'feat/x' });
    expect(() => ApiSchemas['git/checkout'].result.parse({ branch: 'feat/x', cwd: '/w' })).toThrow();
  });
});

/** 每个 UiEvent 形态至少一个合法样本（判别联合穷举的样本面）。 */
function samplePerUiEvent(): UiEvent[] {
  const t = 't1';
  return [
    { type: 'host', phase: 'ready' },
    { type: 'sessionUpdated', session: sampleSession(t) },
    { type: 'sessionRenamed', threadId: t, name: 'renamed' },
    { type: 'sessionRemoved', threadId: t },
    { type: 'sessionDied', threadId: t, reason: 'worker crash' },
    { type: 'sessionParked', threadId: t, reason: 'idle' },
    { type: 'sessionParked', threadId: t, reason: 'manual' },
    { type: 'turnStarted', threadId: t, at: 1 },
    { type: 'userMessage', threadId: t, message: { id: 'm1', text: 'hi', origin: 'user' } },
    { type: 'userMessage', threadId: t, message: { id: 'm2', text: '[task-notification]', origin: 'system' } },
    { type: 'messageStarted', threadId: t, messageId: 'a1', at: 1 },
    { type: 'textDelta', threadId: t, messageId: 'a1', delta: 'he' },
    { type: 'thinkingDelta', threadId: t, messageId: 'a1', delta: '...' },
    { type: 'toolCallAdded', threadId: t, messageId: 'a1', call: { id: 'tc1', name: 'bash', argsPreview: 'ls' }, diff: null },
    { type: 'subagentText', threadId: t, subagentId: 's1', text: 'final text' },
    { type: 'toolUpdated', threadId: t, callId: 'tc1', output: 'partial' },
    { type: 'toolEnded', threadId: t, callId: 'tc1', output: 'done', isError: false, durationMs: 12, diff: null },
    { type: 'toolEnded', threadId: t, callId: 'tc2', output: 'edit', isError: false, durationMs: 5, diff: [{ path: 'a.ts', additions: 3, deletions: 1 }] },
    {
      type: 'messageFinal',
      threadId: t,
      message: { id: 'a1', text: 'final', thinking: '', toolCalls: [{ id: 'tc1', name: 'bash', argsPreview: 'ls' }], usage: { input: 1, output: 2 } },
    },
    { type: 'turnSettled', threadId: t, usage: { input: 1, output: 2 } },
    { type: 'turnSettled', threadId: t, usage: null },
    { type: 'queueChanged', threadId: t, steering: ['a'], followUp: [] },
    { type: 'compacting', threadId: t, active: true },
    { type: 'retrying', threadId: t, attempt: 1, maxAttempts: 3, errorMessage: 'x' },
    { type: 'subagentStarted', threadId: t, subagentId: 's1', agent: 'general-purpose', task: 'explore' },
    { type: 'subagentDelta', threadId: t, subagentId: 's1', delta: 'found' },
    { type: 'subagentTool', threadId: t, subagentId: 's1', call: { id: 'tc2', name: 'read', argsPreview: 'a.ts' }, phase: 'start' },
    { type: 'subagentTool', threadId: t, subagentId: 's1', call: { id: 'tc2', name: 'read', argsPreview: 'a.ts' }, phase: 'end', output: 'x', isError: false },
    { type: 'subagentSettled', threadId: t, subagentId: 's1' },
    { type: 'subagentMessage', threadId: t, subagentId: 's1', agent: 'general-purpose', text: 'report', to: null },
    { type: 'dialogRequest', threadId: t, requestId: 'r1', method: 'confirm', title: 'Allow bash', message: 'npm test', subagentId: 's1', agent: 'explore' },
    { type: 'dialogSettled', requestId: 'r1' },
    { type: 'bashOutput', threadId: t, id: 'b1', delta: 'out' },
  ];
}

function sampleSession(threadId: string): Parameters<typeof SessionViewSchema.parse>[0] {
  return {
    threadId,
    cwd: '/w',
    sessionPath: null,
    title: 'T',
    state: 'live',
    streaming: false,
    model: 'glm/glm-5.3',
    thinkingLevel: 'high',
    lastActivityAt: 1,
  };
}
