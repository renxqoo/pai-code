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
  HistoryItemSchema,
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

  test('hub 帧词表 == 八类（v0.5）', () => {
    expect([...HUB_FRAME_TYPES].sort(byStr)).toEqual(
      ['event', 'heartbeat', 'hub_error', 'response', 'thread_died', 'ui_request', 'subagent_event', 'subagent_message'].sort(byStr),
    );
  });

  test('hub 命令词表 == 36（v0.5）', () => {
    expect(HUB_COMMAND_TYPES.length).toBe(36);
    expect([...HUB_COMMAND_TYPES].sort(byStr)).toEqual(
      [
        'thread/start', 'thread/resume', 'thread/stop', 'thread/list', 'thread/list_saved',
        'prompt', 'steer', 'follow_up', 'abort', 'clear_queue', 'compact',
        'get_state', 'get_messages', 'get_entries', 'get_tree', 'get_session_stats', 'set_session_name', 'get_commands', 'get_fork_messages',
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
      providers: [{ name: 'glm', baseUrl: 'https://api.example.com', api: 'openai-completions', models: ['glm-5.3'] }],
      trustedDefault: true,
      defaultModel: 'glm/glm-5.3',
      onboarded: true,
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
      { kind: 'user', id: 'm1', text: 'hi', origin: 'user', at: 1 },
      {
        kind: 'assistant',
        id: 'm2',
        at: 2,
        text: 'hello',
        thinking: '',
        toolCalls: [{ id: 'tc1', name: 'bash', argsPreview: 'ls', output: 'a\nb', isError: false, diff: null }],
        usage: { input: 10, output: 5 },
      },
      { kind: 'bash', id: 'm3', command: 'git status', output: 'ok', exitCode: 0, cancelled: false, at: 3 },
    ] as const;
    for (const item of items) expect(HistoryItemSchema.parse(item)).toEqual(item);
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

  test('session/bash 与 abortBash 样本', () => {
    expect(ApiSchemas['session/bash'].params.parse({ threadId: 't', command: 'git status' })).toEqual({ threadId: 't', command: 'git status' });
    expect(() => ApiSchemas['session/bash'].params.parse({ threadId: 't', command: '' })).toThrow();
    expect(ApiSchemas['session/abortBash'].params.parse({ threadId: 't' })).toEqual({ threadId: 't' });
  });

  test('file/search 合法样本与拒绝', () => {
    expect(ApiSchemas['file/search'].params.parse({ cwd: '/w', query: 'ap' })).toEqual({ cwd: '/w', query: 'ap' });
    expect(() => ApiSchemas['file/search'].params.parse({ cwd: '', query: '' })).toThrow();
    expect(() => ApiSchemas['file/search'].params.parse({ cwd: '/w' })).toThrow();
  });

  test('agent/list 合法样本：带与不带 threadId', () => {
    expect(ApiSchemas['agent/list'].params.parse({})).toEqual({});
    expect(ApiSchemas['agent/list'].params.parse({ threadId: 't1' })).toEqual({ threadId: 't1' });
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
    ['agent/list 未知键', 'agent/list', { nope: 1 }],
    ['auth/setKey 空 key', 'auth/setKey', { provider: 'p', apiKey: '' }],
    ['session/prompt 空消息', 'session/prompt', { threadId: 't', message: '' }],
    ['session/prompt 非法 streamingBehavior', 'session/prompt', { threadId: 't', message: 'hi', streamingBehavior: 'queue' }],
    ['provider/upsert 空 models', 'provider/upsert', { name: 'p', baseUrl: 'u', api: 'openai-completions', models: [] }],
  ])('拒绝：%s', (_name: string, method: string, bad: unknown) => {
    expect(() => ApiSchemas[method as keyof typeof ApiSchemas].params.parse(bad)).toThrow();
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
