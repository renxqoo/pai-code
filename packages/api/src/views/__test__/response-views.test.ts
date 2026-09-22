import { describe, expect, test } from 'bun:test';

import {
  hostInfoView,
  inflightView,
  modelInfos,
  pendingDialogsView,
  previewCommands,
  savedSessions,
  sessionCommands,
  sessionStatsView,
  subagentSnapshotView,
  thinkingLevelView,
  threadListRows,
  threadStateView,
  toSessionView,
} from '../response-views';

describe('toSessionView · 缺省兜底', () => {
  test('最少输入 → 缺省形态', () => {
    expect(toSessionView({ threadId: 't', cwd: '/w', sessionPath: null })).toEqual({
      threadId: 't',
      cwd: '/w',
      sessionPath: null,
      title: 'New conversation',
      state: 'live',
      streaming: false,
      model: null,
      thinkingLevel: null,
      lastActivityAt: 0,
    });
  });

  test('全字段 round-trip', () => {
    expect(
      toSessionView({
        threadId: 't',
        cwd: '/w',
        sessionPath: '/w/s.jsonl',
        state: 'parked',
        streaming: true,
        title: '标题',
        model: 'glm/glm-5.3',
        thinkingLevel: 'high',
        lastActivityAt: 42,
      }),
    ).toEqual({
      threadId: 't',
      cwd: '/w',
      sessionPath: '/w/s.jsonl',
      state: 'parked',
      streaming: true,
      title: '标题',
      model: 'glm/glm-5.3',
      thinkingLevel: 'high',
      lastActivityAt: 42,
    });
  });
});

describe('threadStateView（get_state）', () => {
  test('model {provider, model} 收窄 + queue 面（条目形状，缺 id/text 的垃圾项过滤）', () => {
    expect(
      threadStateView({
        model: { provider: 'glm', model: 'glm-5.3' },
        isStreaming: true,
        isCompacting: false,
        sessionName: 'n',
        messageCount: 7,
        queue: {
          steering: [{ id: 'e1', text: '插一句' }],
          followUp: [{ id: 'e2', text: '接着问' }, { text: '缺id' }, { id: 'e3' }, 3],
        },
      }),
    ).toEqual({
      model: { provider: 'glm', model: 'glm-5.3' },
      isStreaming: true,
      isCompacting: false,
      sessionName: 'n',
      messageCount: 7,
      queue: { steering: [{ id: 'e1', text: '插一句' }], followUp: [{ id: 'e2', text: '接着问' }] },
    });
  });

  test('降级：缺 provider/model、空 sessionName、垃圾 queue → 空形态', () => {
    expect(threadStateView({ model: { model: 'm' } }).model).toBeNull();
    expect(threadStateView({ model: { provider: 'p' } }).model).toBeNull();
    expect(threadStateView({ sessionName: '' }).sessionName).toBeNull();
    expect(threadStateView({}).queue).toEqual({ steering: [], followUp: [] });
    expect(threadStateView({ queue: { steering: 'x', followUp: null } }).queue).toEqual({ steering: [], followUp: [] });
    expect(threadStateView('junk')).toEqual({
      model: null,
      isStreaming: false,
      isCompacting: false,
      sessionName: null,
      messageCount: 0,
      queue: { steering: [], followUp: [] },
    });
  });
});

describe('inflightView（get_inflight）', () => {
  test('全字段：text/thinking 块拼接、tool_use_partial 宽容解析、toolOutputs、bash', () => {
    expect(
      inflightView({
        turnStartSeq: 12,
        turnStartedAt: 5000,
        message: {
          role: 'assistant',
          content: [
            { type: 'thinking', text: '先想' },
            { type: 'text', text: '正在跑' },
            { type: 'tool_use_partial', id: 'tc1', name: 'bash', text: '{"command":"ls -la"}' },
          ],
        },
        toolOutputs: [
          { callId: 'tc0', output: 'tail…', truncated: true, startedAt: 9 },
          { output: '无 callId 丢弃' },
          { callId: 'tcX', output: 'o', truncated: false, startedAt: 1 },
        ],
        bash: { id: 'b1', command: 'git status', startedAt: 8 },
      }),
    ).toEqual({
      turnStartSeq: 12,
      turnStartedAt: 5000,
      message: {
        messageTs: 5000,
        text: '正在跑',
        thinking: '先想',
        toolCalls: [{ id: 'tc1', name: 'bash', argsPreview: 'ls -la' }],
      },
      toolOutputs: [
        { callId: 'tc0', output: 'tail…', truncated: true, startedAt: 9 },
        { callId: 'tcX', output: 'o', truncated: false, startedAt: 1 },
      ],
      bash: { id: 'b1', command: 'git status', startedAt: 8 },
    });
  });

  test('tool_use_partial 的 text 是流式半成品 JSON：解析失败退空参数（argsPreview 空串）', () => {
    const view = inflightView({
      message: { role: 'assistant', content: [{ type: 'tool_use_partial', id: 'tc1', name: 'write_file', text: '{"path":"a.ts","con' }] },
    });
    expect(view.message).toEqual({ messageTs: 0, text: '', thinking: '', toolCalls: [{ id: 'tc1', name: 'write_file', argsPreview: '' }] });
  });

  test('降级：message 缺省/非对象 null、缺 turnStart 序对 null、垃圾 toolOutputs/bash', () => {
    expect(inflightView({})).toEqual({ turnStartSeq: null, turnStartedAt: null, message: null, toolOutputs: [], bash: null });
    expect(inflightView('junk').message).toBeNull();
    expect(inflightView({ toolOutputs: 'x', bash: 42 }).toolOutputs).toEqual([]);
    expect(inflightView({ toolOutputs: 'x', bash: 42 }).bash).toBeNull();
    expect(inflightView({ message: { content: 'x' } }).message).toEqual({ messageTs: 0, text: '', thinking: '', toolCalls: [] });
  });
});

describe('subagentSnapshotView（get_subagents）', () => {
  test('合法快照收窄（kind=subagent 行保留、local-session 行丢弃；词表外 status 回落 idle）', () => {
    expect(
      subagentSnapshotView({
        subagents: [
          { kind: 'subagent', agentId: 'a1', sessionId: 's1', type: 'explore', depth: 1, status: 'running', work: '扫描' },
          { kind: 'subagent', agentId: 'a2', sessionId: 's2', type: 'writer', depth: 1, status: 'weird' },
          { kind: 'local-session', name: '本地会话', ref: 'r1', status: 'running' },
        ],
      }),
    ).toEqual([
      { agentId: 'a1', agentType: 'explore', sessionId: 's1', work: '扫描', status: 'running' },
      { agentId: 'a2', agentType: 'writer', sessionId: 's2', status: 'idle' },
    ]);
  });

  test('缺 agentId/type 的行丢弃；非数组/垃圾 → 空形态', () => {
    expect(
      subagentSnapshotView({
        subagents: [
          { kind: 'subagent', agentId: '', sessionId: 's', type: 'x', status: 'idle' },
          { kind: 'subagent', agentId: 'a', sessionId: 's', type: '', status: 'idle' },
          { kind: 'weird', agentId: 'a', type: 'x' },
          42,
          null,
        ],
      }),
    ).toEqual([]);
    expect(subagentSnapshotView({})).toEqual([]);
    expect(subagentSnapshotView(null)).toEqual([]);
  });
});

describe('pendingDialogsView（get_pending_dialogs）', () => {
  test('与 ui_request 帧同字段收窄（requestId/method 必填）', () => {
    expect(
      pendingDialogsView({
        dialogs: [
          { requestId: 'r1', threadId: 't', method: 'confirm', payload: { tool: 'bash', summary: 's' } },
          { requestId: '', threadId: 't', method: 'confirm', payload: {} },
          { requestId: 'r2', method: '', payload: {} },
        ],
      }),
    ).toEqual([{ requestId: 'r1', threadId: 't', method: 'confirm', payload: { tool: 'bash', summary: 's' } }]);
    expect(pendingDialogsView({ dialogs: [{ requestId: 'r', method: 'confirm' }] })[0]?.payload).toEqual({});
  });

  test('非数组/垃圾 → 空数组', () => {
    expect(pendingDialogsView({})).toEqual([]);
    expect(pendingDialogsView('junk')).toEqual([]);
  });
});

describe('savedSessions（thread/list_saved）', () => {
  test('summary 无 sessionPath：按 <sessionsRoot>/<id>/events.jsonl 重建', () => {
    expect(
      savedSessions(
        {
          sessions: [
            { id: 'abc', title: '会话一', cwd: '/w', updatedAt: 5000, messageCount: 2 },
            { id: 'def', title: '', cwd: '/w2', updatedAt: 'x' },
            { title: '缺 id 丢弃' },
          ],
        },
        '/root/sessions',
      ),
    ).toEqual([
      { sessionPath: '/root/sessions/abc/events.jsonl', sessionId: 'abc', cwd: '/w', name: '会话一', modifiedAt: 5000, messageCount: 2, firstMessage: '会话一' },
      { sessionPath: '/root/sessions/def/events.jsonl', sessionId: 'def', cwd: '/w2', name: null, modifiedAt: 0, messageCount: 0, firstMessage: '' },
    ]);
  });

  test('非数组/垃圾 → 空数组', () => {
    expect(savedSessions({}, '/root')).toEqual([]);
    expect(savedSessions(null, '/root')).toEqual([]);
  });
});

describe('modelInfos（get_models 扁平数组）', () => {
  test('provider+id 必填、source 词表收窄', () => {
    expect(
      modelInfos([
        { id: 'glm-5.3', provider: 'glm', source: 'preset', contextWindow: 200000 },
        { id: 'm2', provider: 'glm', source: 'custom' },
        { id: 'm3', provider: 'glm', source: 'weird' },
        { id: '', provider: 'glm' },
        { id: 'm4' },
        42,
      ]),
    ).toEqual([
      { provider: 'glm', modelId: 'glm-5.3', source: 'preset' },
      { provider: 'glm', modelId: 'm2', source: 'custom' },
      { provider: 'glm', modelId: 'm3' },
    ]);
  });

  test('非数组 → 空数组', () => {
    expect(modelInfos({ models: [{ id: 'm', provider: 'p' }] })).toEqual([]);
    expect(modelInfos(null)).toEqual([]);
  });
});

describe('sessionStatsView（get_session_stats）', () => {
  test('tokens 四元组 + 计数面 round-trip（cost 嵌 tokens 且可缺席）', () => {
    expect(sessionStatsView({ userMessages: 2, assistantMessages: 3, toolCalls: 4, toolResults: 6, tokens: { input: 10, output: 5, total: 15, cost: 0.5 } })).toEqual({
      userMessages: 2,
      assistantMessages: 3,
      toolCalls: 4,
      toolResults: 6,
      tokens: { input: 10, output: 5, total: 15 },
      cost: 0.5,
    });
    expect(sessionStatsView({ userMessages: 1, assistantMessages: 1, toolCalls: 1, toolResults: 1, tokens: { input: 1, output: 1, total: 2 } }).cost).toBe(0);
  });

  test('垃圾输入降级全零形态不抛', () => {
    expect(sessionStatsView({})).toEqual({ userMessages: 0, assistantMessages: 0, toolCalls: 0, toolResults: 0, tokens: { input: 0, output: 0, total: 0 }, cost: 0 });
    expect(sessionStatsView('junk')).toEqual({ userMessages: 0, assistantMessages: 0, toolCalls: 0, toolResults: 0, tokens: { input: 0, output: 0, total: 0 }, cost: 0 });
    expect(sessionStatsView({ tokens: 'x', cost: 'y' }).tokens).toEqual({ input: 0, output: 0, total: 0 });
  });
});

describe('thinkingLevelView（get_thinking_level）', () => {
  test('level 透传 + source 词表内收窄（5 档 + off 无值态）', () => {
    expect(thinkingLevelView({ level: 'high', source: 'session' })).toEqual({ level: 'high', source: 'session' });
    expect(thinkingLevelView({ level: 'max', source: 'project' })).toEqual({ level: 'max', source: 'project' });
    expect(thinkingLevelView({ level: 'off', source: 'user' })).toEqual({ level: 'off', source: 'user' });
  });

  test('source 词表外 → off；垃圾 → 空串 + off', () => {
    expect(thinkingLevelView({ level: 'low', source: 'weird' })).toEqual({ level: 'low', source: 'off' });
    expect(thinkingLevelView({})).toEqual({ level: '', source: 'off' });
    expect(thinkingLevelView(null)).toEqual({ level: '', source: 'off' });
  });
});

describe('sessionCommands（get_commands 顶层数组）', () => {
  test('两源条目透传（command/skill），description 缺失收窄 null', () => {
    expect(
      sessionCommands([
        { name: 'compact', description: 'Compact the conversation history', source: 'command' },
        { name: 'skill:writer', description: '写文档', source: 'skill' },
      ]),
    ).toEqual([
      { name: 'compact', description: 'Compact the conversation history', source: 'command' },
      { name: 'skill:writer', description: '写文档', source: 'skill' },
    ]);
  });

  test.each([
    ['缺名丢弃', [{ description: 'x', source: 'command' }]],
    ['空名丢弃', [{ name: '', source: 'command' }]],
    ['source 词表外丢弃', [{ name: '/x', source: 'mcp' }]],
    ['非对象条目丢弃', ['/review', 42, null]],
    ['description 非字符串收窄 null', [{ name: '/x', description: 7, source: 'command' }]],
  ])('垃圾降级：%s', (_name, commands) => {
    const kept = sessionCommands(commands);
    expect(kept.every((item) => typeof item.name === 'string' && item.name.length > 0)).toBe(true);
    expect(kept.every((item) => item.source === 'command' || item.source === 'skill')).toBe(true);
  });

  test('混合垃圾条目中合法条目保留；非数组 → 空', () => {
    expect(sessionCommands([{ name: '/ok', source: 'command' }, { name: 1, source: 'command' }, 'junk'])).toEqual([
      { name: '/ok', description: null, source: 'command' },
    ]);
    expect(sessionCommands({ commands: [{ name: '/x', source: 'plugin' }] })).toEqual([]);
    expect(sessionCommands(null)).toEqual([]);
  });
});

describe('previewCommands · 预会话目录（新建任务页 `/` 补全）', () => {
  test('技能名加 skill: 前缀成 skill 源条目（description 恒 null）', () => {
    expect(previewCommands([{ name: 'rxopen-hot' }, { name: 'writer' }])).toEqual([
      { name: 'skill:rxopen-hot', description: null, source: 'skill' },
      { name: 'skill:writer', description: null, source: 'skill' },
    ]);
  });

  test('空名技能丢弃；空清单 → 空目录', () => {
    expect(previewCommands([{ name: '' }])).toEqual([]);
    expect(previewCommands([])).toEqual([]);
  });
});

describe('hostInfoView（get_host_info）', () => {
  test('全字段 round-trip', () => {
    const data = {
      version: '1.0.0',
      bunVersion: '1.4.2',
      pid: 42,
      uptimeMs: 1000,
      rssBytes: 2048,
      threads: { live: 1, parked: 2, dead: 3 },
      limits: { maxThreads: 32, idleRetireMs: 300000, workerStaleMs: 30000, workerExitTimeoutMs: 10000, rssRetireBytes: 536870912, bashTimeoutMs: 600000 },
    };
    expect(hostInfoView(data)).toEqual(data);
  });

  test('垃圾输入降级全零形态不抛（limits 数值位回落 1/0）', () => {
    expect(hostInfoView('junk')).toEqual({
      version: '',
      bunVersion: '',
      pid: 0,
      uptimeMs: 0,
      rssBytes: 0,
      threads: { live: 0, parked: 0, dead: 0 },
      limits: { maxThreads: 1, idleRetireMs: 1, workerStaleMs: 1, workerExitTimeoutMs: 1, rssRetireBytes: 0, bashTimeoutMs: 0 },
    });
  });
});

describe('threadListRows（thread/list 顶层数组）', () => {
  test('合法行 + 观测字段（rss null 容错）', () => {
    const rows = threadListRows([
      { threadId: 't1', cwd: '/w', sessionPath: '/w/s.jsonl', state: 'live', isStreaming: true, idleMs: 12, rssBytes: 111, keepalive: true },
      { threadId: 't2', cwd: '/w', sessionPath: null, state: 'parked', isStreaming: false, idleMs: 0, rssBytes: null, keepalive: false },
    ]);
    expect(rows).toEqual([
      { threadId: 't1', cwd: '/w', sessionPath: '/w/s.jsonl', state: 'live', isStreaming: true, idleMs: 12, rssBytes: 111, keepalive: true },
      { threadId: 't2', cwd: '/w', sessionPath: null, state: 'parked', isStreaming: false, idleMs: 0, rssBytes: null, keepalive: false },
    ]);
  });

  test('缺 threadId 或词表外 state 的行丢弃（未来 hub 新状态不误读）；非数组降级空', () => {
    expect(threadListRows([{ cwd: '/w' }, { threadId: 'ok', state: 'weird' }])).toEqual([]);
    expect(threadListRows({ threads: [{ threadId: 't', state: 'live' }] })).toEqual([]);
    expect(threadListRows(null)).toEqual([]);
  });
});
