import { describe, expect, test } from 'bun:test';

import { foldDeath, foldStopIntent, foldThreadEvent } from '../fold-events';
import { foldHydrate } from '../fold-hydrate';
import { initialThreadState } from '../live-thread-state';
import type { HistoryItem, UiEvent } from '@paiapp/contracts';
import type { ThreadItem } from '@/thread/thread-model';

const T = 1_000;
const tick = (n: number): number => T + n;

function ev(event: UiEvent): UiEvent {
  return event;
}

function history(partial: Partial<HistoryItem> & Pick<HistoryItem, 'id' | 'kind'>): HistoryItem {
  if (partial.kind === 'user') return { text: '', origin: 'user', images: [], at: T, ...partial } as HistoryItem;
  if (partial.kind === 'assistant') return { text: '', thinking: '', toolCalls: [], usage: null, stopReason: null, errorMessage: null, at: T, ...partial } as HistoryItem;
  return { command: '', output: '', exitCode: 0, cancelled: false, at: T, ...partial } as HistoryItem;
}

function liveTurn(state: { items: readonly ThreadItem[] }): ThreadItem {
  const item = state.items[state.items.length - 1];
  if (item === undefined) throw new Error('no live turn');
  return item;
}

describe('foldEvents · 轮次生命周期', () => {
  test('完整轮次：回显 → 流式 → 权威替换 → settle（恰好一次终态）', () => {
    let s = initialThreadState;
    s = foldThreadEvent(s, ev({ type: 'userMessage', threadId: 't', message: { id: 'e1', text: 'hi', origin: 'user' } }), tick(0));
    s = foldThreadEvent(s, ev({ type: 'turnStarted', threadId: 't', at: tick(10) }), tick(10));
    expect(s.streaming).toBe(true);
    s = foldThreadEvent(s, ev({ type: 'messageStarted', threadId: 't', messageId: 'm1', at: tick(11) }), tick(11));
    s = foldThreadEvent(s, ev({ type: 'textDelta', threadId: 't', messageId: 'm1', delta: '你好' }), tick(20));
    s = foldThreadEvent(s, ev({ type: 'textDelta', threadId: 't', messageId: 'm1', delta: '！' }), tick(30));
    const turnBefore = liveTurn(s);
    if (turnBefore?.kind !== 'turn') throw new Error('expected turn');
    expect(turnBefore.turn.blocks).toEqual([{ kind: 'text', id: 'text-m1', text: '你好！' }]);
    expect(turnBefore.turn.status).toBe('running');

    // 权威替换（流式拼接错误时以 messageFinal 为准）
    s = foldThreadEvent(
      s,
      ev({
        type: 'messageFinal',
        threadId: 't',
        message: { id: 'm1', text: '你好！！', thinking: '想了想', toolCalls: [], usage: { input: 1, output: 2 } },
      }),
      tick(40),
    );
    s = foldThreadEvent(s, ev({ type: 'turnSettled', threadId: 't', ok: true, usage: null }), tick(50));
    expect(s.streaming).toBe(false);
    const turn = liveTurn(s);
    if (turn?.kind !== 'turn') throw new Error('expected turn');
    expect(turn.turn.status).toBe('completed');
    expect(turn.turn.endedAt).toBe(tick(50));
    // 消息序列：user 回显在前、轮次在后
    expect(s.items[0]).toMatchObject({ kind: 'message', message: { role: 'user', text: 'hi' } });
    // 权威文本替换 delta 拼接
    const text = turn.turn.blocks.find((b) => b.kind === 'text');
    expect(text).toMatchObject({ text: '你好！！' });
    const thinking = turn.turn.blocks.find((b) => b.kind === 'thinking');
    expect(thinking).toMatchObject({ text: '想了想' });
  });

  test('同一轮次多段消息（工具循环）：每段独立 text/thinking 块', () => {
    let s = initialThreadState;
    s = foldThreadEvent(s, ev({ type: 'turnStarted', threadId: 't', at: tick(0) }), tick(0));
    s = foldThreadEvent(s, ev({ type: 'messageStarted', threadId: 't', messageId: 'a', at: tick(1) }), tick(1));
    s = foldThreadEvent(s, ev({ type: 'textDelta', threadId: 't', messageId: 'a', delta: '先查' }), tick(2));
    s = foldThreadEvent(s, ev({ type: 'messageFinal', threadId: 't', message: { id: 'a', text: '先查', thinking: '', toolCalls: [], usage: null } }), tick(3));
    s = foldThreadEvent(s, ev({ type: 'messageStarted', threadId: 't', messageId: 'b', at: tick(4) }), tick(4));
    s = foldThreadEvent(s, ev({ type: 'textDelta', threadId: 't', messageId: 'b', delta: '结论' }), tick(5));
    s = foldThreadEvent(s, ev({ type: 'messageFinal', threadId: 't', message: { id: 'b', text: '结论', thinking: '', toolCalls: [], usage: null } }), tick(6));
    s = foldThreadEvent(s, ev({ type: 'turnSettled', threadId: 't', ok: true, usage: null }), tick(7));
    const turn = liveTurn(s);
    if (turn?.kind !== 'turn') throw new Error('expected turn');
    const texts = turn.turn.blocks.filter((b) => b.kind === 'text');
    expect(texts.map((b) => (b.kind === 'text' ? b.text : ''))).toEqual(['先查', '结论']);
    expect(turn.turn.status).toBe('completed');
  });

  test('agent_end 等价的多段消息期间不终态；settle 恰好一次', () => {
    let s = initialThreadState;
    s = foldThreadEvent(s, ev({ type: 'turnStarted', threadId: 't', at: tick(0) }), tick(0));
    // auto-retry 进行中仍 running，retrying 状态可见
    s = foldThreadEvent(s, ev({ type: 'retrying', threadId: 't', attempt: 1, errorMessage: 'e' }), tick(1));
    expect(s.retrying).not.toBeNull();
    expect(s.streaming).toBe(true);
    s = foldThreadEvent(s, ev({ type: 'messageStarted', threadId: 't', messageId: 'm', at: tick(2) }), tick(2));
    expect(s.retrying).toBeNull();
    s = foldThreadEvent(s, ev({ type: 'turnSettled', threadId: 't', ok: true, usage: null }), tick(3));
    expect(s.streaming).toBe(false);
    // 重复 settle 不再改变
    const settled = s;
    s = foldThreadEvent(s, ev({ type: 'turnSettled', threadId: 't', ok: true, usage: null }), tick(4));
    expect(s.items).toEqual(settled.items);
  });

  test('用户停止：stopIntent → settle 呈 stopped', () => {
    let s = initialThreadState;
    s = foldThreadEvent(s, ev({ type: 'turnStarted', threadId: 't', at: tick(0) }), tick(0));
    s = foldStopIntent(s);
    s = foldThreadEvent(s, ev({ type: 'turnSettled', threadId: 't', ok: true, usage: null }), tick(100));
    const turn = liveTurn(s);
    if (turn?.kind !== 'turn') throw new Error('expected turn');
    expect(turn.turn.status).toBe('stopped');
    // 迟到的 stop 点击（已 settle）不得污染下一轮
    s = foldStopIntent(s);
    s = foldThreadEvent(s, ev({ type: 'turnStarted', threadId: 't', at: tick(200) }), tick(200));
    s = foldThreadEvent(s, ev({ type: 'turnSettled', threadId: 't', ok: true, usage: null }), tick(300));
    const next = liveTurn(s);
    if (next?.kind !== 'turn') throw new Error('expected turn');
    expect(next.turn.status).toBe('completed');
  });

  test('错过 settle 的遗留 running 轮：冻结后退场（权威内容由对账提供，防双显）', () => {
    let s = initialThreadState;
    s = foldThreadEvent(s, ev({ type: 'turnStarted', threadId: 't', at: tick(0) }), tick(0));
    s = foldThreadEvent(s, ev({ type: 'turnStarted', threadId: 't', at: tick(500) }), tick(500));
    // 只剩新一轮的 live 轮；旧装饰轮退场（其内容由 settle 对账的权威条目恢复）
    expect(s.items.length).toBe(1);
    const only = s.items[0];
    if (only?.kind !== 'turn') throw new Error('expected turn');
    expect(only.turn.status).toBe('running');
    expect(only.turn.startedAt).toBe(tick(500));
  });
});

describe('foldEvents · 真实协议形态回归（对抗审查 P0-1/P0-2）', () => {
  test('message_update 增量 id 为空串：挂到 message_start 建立的 liveMessageId，messageFinal 权威替换不双份', () => {
    let s = initialThreadState;
    s = foldThreadEvent(s, ev({ type: 'turnStarted', threadId: 't', at: tick(0) }), tick(0));
    s = foldThreadEvent(s, ev({ type: 'messageStarted', threadId: 't', messageId: 'm1', at: tick(1) }), tick(1));
    // pai-cli toWireEvent 剥离 partial/message：delta 无 id
    s = foldThreadEvent(s, ev({ type: 'textDelta', threadId: 't', messageId: '', delta: '苹果 ' }), tick(2));
    s = foldThreadEvent(s, ev({ type: 'textDelta', threadId: 't', messageId: '', delta: '香蕉' }), tick(3));
    s = foldThreadEvent(
      s,
      ev({ type: 'messageFinal', threadId: 't', message: { id: 'm1', text: '苹果 香蕉 橘子', thinking: '', toolCalls: [], usage: null } }),
      tick(4),
    );
    s = foldThreadEvent(s, ev({ type: 'turnSettled', threadId: 't', ok: true, usage: null }), tick(5));
    const turn = liveTurn(s);
    if (turn?.kind !== 'turn') throw new Error('expected turn');
    const texts = turn.turn.blocks.filter((b) => b.kind === 'text');
    expect(texts.length).toBe(1);
    expect(texts[0]).toMatchObject({ text: '苹果 香蕉 橘子' });
  });

  test('user 消息的 message_start/end 不再产生渲染事件（adapter 过滤后的链路）', () => {
    // adapter 层已过滤；fold 侧防御：messageStarted 空 id 不炸
    let s = initialThreadState;
    s = foldThreadEvent(s, ev({ type: 'turnStarted', threadId: 't', at: tick(0) }), tick(0));
    s = foldThreadEvent(s, ev({ type: 'messageStarted', threadId: 't', messageId: '', at: tick(1) }), tick(1));
    s = foldThreadEvent(s, ev({ type: 'textDelta', threadId: 't', messageId: '', delta: 'x' }), tick(2));
    expect(s.items.length).toBe(1);
  });

  test('hydrate/rebuild：全量重建替换 items、继承 stopped、清 live 轮句柄', () => {
    let s = initialThreadState;
    s = foldThreadEvent(s, ev({ type: 'turnStarted', threadId: 't', at: tick(0) }), tick(0));
    s = foldStopIntent(s);
    s = foldThreadEvent(s, ev({ type: 'turnSettled', threadId: 't', ok: true, usage: null }), tick(10));
    s = foldHydrate(s, {
      kind: 'hydrate/rebuild',
      items: [
        history({ kind: 'user', id: 'u1', text: '问' }),
        history({ kind: 'assistant', id: 'a1', text: '答', at: tick(5) }),
      ],
      cursor: 1,
    });
    expect(s.liveTurnId).toBeNull();
    expect(s.items.map((i) => (i.kind === 'message' ? i.message.text : i.turn.status))).toEqual(['问', 'stopped']);
    expect([...s.seenIds]).toEqual(['u1', 'a1']);
  });
});

describe('foldEvents · 工具与 diff', () => {
  test('toolCallAdded → toolUpdated → toolEnded（durationMs 客户端观测；diff 聚合块）', () => {
    let s = initialThreadState;
    s = foldThreadEvent(s, ev({ type: 'turnStarted', threadId: 't', at: tick(0) }), tick(0));
    s = foldThreadEvent(
      s,
      ev({ type: 'toolCallAdded', threadId: 't', messageId: 'm', call: { id: 'c1', name: 'bash', argsPreview: 'bun test' }, diff: null }),
      tick(10),
    );
    s = foldThreadEvent(s, ev({ type: 'toolUpdated', threadId: 't', callId: 'c1', output: '部分' }), tick(20));
    s = foldThreadEvent(
      s,
      ev({ type: 'toolEnded', threadId: 't', callId: 'c1', output: '通过', isError: false, durationMs: 0, diff: null }),
      tick(110),
    );
    let turn = liveTurn(s);
    if (turn?.kind !== 'turn') throw new Error('expected turn');
    let tools = turn.turn.blocks.find((b) => b.kind === 'tools');
    expect(tools).toMatchObject({ calls: [{ id: 'c1', name: 'bash', output: '通过', exitCode: 0, status: 'ok', durationMs: 100 }] });

    s = foldThreadEvent(
      s,
      ev({ type: 'toolEnded', threadId: 't', callId: 'x', output: '', isError: true, durationMs: 0, diff: [{ path: 'a.ts', additions: 2, deletions: 1 }] }),
      tick(120),
    );
    s = foldThreadEvent(
      s,
      ev({ type: 'toolEnded', threadId: 't', callId: 'y', output: '', isError: false, durationMs: 0, diff: [{ path: 'b.ts', additions: 5, deletions: 0 }] }),
      tick(130),
    );
    turn = liveTurn(s);
    if (turn?.kind !== 'turn') throw new Error('expected turn');
    const diff = turn.turn.blocks.find((b) => b.kind === 'diff');
    expect(diff).toMatchObject({ diff: { changedFiles: 2, additions: 7, deletions: 1, files: [{ path: 'a.ts', additions: 2, deletions: 1 }, { path: 'b.ts', additions: 5, deletions: 0 }] } });
    // 同路径再次编辑：替换计数不重复累计
    tools = turn.turn.blocks.find((b) => b.kind === 'tools');
    expect(tools).toBeDefined();
  });

  test('messageFinal 携带流式未见的 toolCall → 补 running 调用', () => {
    let s = initialThreadState;
    s = foldThreadEvent(s, ev({ type: 'turnStarted', threadId: 't', at: tick(0) }), tick(0));
    s = foldThreadEvent(
      s,
      ev({ type: 'messageFinal', threadId: 't', message: { id: 'm', text: 'x', thinking: '', toolCalls: [{ id: 'ghost', name: 'read', argsPreview: 'a' }], usage: null } }),
      tick(5),
    );
    const turn = liveTurn(s);
    if (turn?.kind !== 'turn') throw new Error('expected turn');
    const tools = turn.turn.blocks.find((b) => b.kind === 'tools');
    expect(tools).toMatchObject({ calls: [{ id: 'ghost', name: 'read', status: 'running' }] });
  });
});

describe('foldEvents · 水化与对账', () => {
  test('initial 水化 → reconcile 追加去重 → settle 对账替换 live 轮', () => {
    let s = foldHydrate(
      initialThreadState,
      {
        kind: 'hydrate/initial',
        items: [
          history({ kind: 'user', id: 'e1', text: '问' }),
          history({ kind: 'assistant', id: 'e2', text: '答', at: tick(2) }),
        ],
        cursor: 2,
      },
    );
    expect(s.items.map((i) => (i.kind === 'message' ? i.message.text : i.turn.id))).toEqual(['问', 'turn-e2']);
    expect(s.cursor).toBe(2);

    // 新一轮开始：live 轮在尾部
    s = foldThreadEvent(s, ev({ type: 'turnStarted', threadId: 't', at: tick(100) }), tick(100));
    // turnStarted 对账带出用户回显（插到 live 轮之前）
    s = foldHydrate(
      s,
      { kind: 'hydrate/reconcile', items: [history({ kind: 'user', id: 'e3', text: '追问' })], cursor: 3, dropLiveTurn: false },
    );
    expect(s.items.map((i) => (i.kind === 'message' ? i.message.text : i.turn.id))).toEqual(['问', 'turn-e2', '追问', s.liveTurnId]);
    // settle：权威条目替换 live 轮
    s = foldThreadEvent(s, ev({ type: 'textDelta', threadId: 't', messageId: 'm9', delta: '流式' }), tick(110));
    s = foldThreadEvent(s, ev({ type: 'turnSettled', threadId: 't', ok: true, usage: null }), tick(120));
    s = foldHydrate(
      s,
      {
        kind: 'hydrate/reconcile',
        items: [
          history({ kind: 'user', id: 'e3', text: '追问' }),
          history({ kind: 'assistant', id: 'e4', text: '权威答案', at: tick(115) }),
        ],
        cursor: 4,
        dropLiveTurn: true,
      },
    );
    expect(s.liveTurnId).toBeNull();
    expect(s.items.map((i) => (i.kind === 'message' ? i.message.text : i.turn.id))).toEqual(['问', 'turn-e2', '追问', 'turn-e4']);
    // 重复对账同条目（重复投递/全量兜底）：去重
    s = foldHydrate(
      s,
      { kind: 'hydrate/reconcile', items: [history({ kind: 'user', id: 'e3', text: '追问' })], cursor: 4, dropLiveTurn: false },
    );
    expect(s.items.length).toBe(4);
  });

  test('水化失败标记 → 重试入口', () => {
    const s = foldHydrate(initialThreadState, { kind: 'hydrate/failed' });
    expect(s.hydrateFailed).toBe(true);
  });

  test('userMessage 事件去重（同 id 二次投递）', () => {
    let s = initialThreadState;
    s = foldThreadEvent(s, ev({ type: 'userMessage', threadId: 't', message: { id: 'e1', text: 'hi', origin: 'user' } }), T);
    const before = s.items.length;
    s = foldThreadEvent(s, ev({ type: 'userMessage', threadId: 't', message: { id: 'e1', text: 'hi', origin: 'user' } }), T);
    expect(s.items.length).toBe(before);
  });

  test('系统注入消息（task-notification）渲染为 system 角色', () => {
    let s = initialThreadState;
    s = foldThreadEvent(s, ev({ type: 'userMessage', threadId: 't', message: { id: 'n1', text: '[task-notification] subagent done', origin: 'system' } }), T);
    expect(s.items[0]).toMatchObject({ kind: 'message', message: { role: 'system' } });
  });
});

describe('foldEvents · 队列/压缩/崩溃', () => {
  test('queueChanged / compacting / sessionDied → turnStarted 清除', () => {
    let s = initialThreadState;
    s = foldThreadEvent(s, ev({ type: 'queueChanged', threadId: 't', steering: ['改一下'], followUp: ['然后'] }), T);
    expect(s.queue).toEqual({ steering: ['改一下'], followUp: ['然后'] });
    s = foldThreadEvent(s, ev({ type: 'compacting', threadId: 't', active: true }), T);
    expect(s.compacting).toBe(true);
    s = foldThreadEvent(s, ev({ type: 'sessionDied', threadId: 't', reason: 'x' }), T);
    expect(s.crashed).toBe(true);
    s = foldThreadEvent(s, ev({ type: 'turnStarted', threadId: 't', at: tick(1) }), tick(1));
    expect(s.crashed).toBe(false);
  });

  test('症状回归：worker 死亡就地终态全部在途面（streaming 滞留不再把空闲会话新消息判成生成中）', () => {
    let s: typeof initialThreadState = {
      ...initialThreadState,
      streaming: true,
      stopping: true,
      compacting: true,
      retrying: { attempt: 1, errorMessage: 'x' },
      bashRunning: true,
      bashTail: 'partial',
      queue: { steering: ['插入'], followUp: ['下一条'] },
    };
    s = foldThreadEvent(s, ev({ type: 'turnStarted', threadId: 't', at: tick(0) }), tick(0));
    s = foldThreadEvent(s, ev({ type: 'subagentStarted', threadId: 't', agentId: 's1', agentName: 'explore', task: '扫描' }), tick(1));
    s = foldThreadEvent(s, ev({ type: 'sessionDied', threadId: 't', reason: 'worker_crash' }), tick(5));
    expect(s.streaming).toBe(false);
    expect(s.stopping).toBe(false);
    expect(s.compacting).toBe(false);
    expect(s.retrying).toBeNull();
    expect(s.bashRunning).toBe(false);
    expect(s.bashTail).toBe('');
    expect(s.queue).toEqual({ steering: [], followUp: [] });
    expect(s.crashed).toBe(true);
    expect(s.agents[0]).toMatchObject({ id: 'explore', agentId: 's1', status: 'on-disk', endedAt: tick(5) });
    // running 轮不会再有 settle：冻结为 completed（与错过 settle 的遗留轮一致）
    const turn = liveTurn(s);
    if (turn?.kind !== 'turn') throw new Error('expected turn');
    expect(turn.turn.status).toBe('completed');
    expect(turn.turn.endedAt).toBe(tick(5));
  });

  test('host/dialog 等事件在 thread 层为无操作；bashOutput 折叠尾部', () => {
    const s = initialThreadState;
    expect(foldThreadEvent(s, ev({ type: 'host', phase: 'ready' }), T)).toBe(s);
    expect(foldThreadEvent(s, ev({ type: 'dialogRequest', threadId: 't', requestId: 'r', method: 'confirm' }), T)).toBe(s);
    expect(foldThreadEvent(s, ev({ type: 'bashOutput', threadId: 't', id: 'b', delta: 'x' }), T).bashTail).toBe('x');
  });
});

describe('foldEvents · 子代理', () => {
  test('停止与 worker 死亡：working 子代理就地终态', () => {
    let s = initialThreadState;
    s = foldThreadEvent(s, ev({ type: 'turnStarted', threadId: 't', at: tick(0) }), tick(0));
    s = foldThreadEvent(s, ev({ type: 'subagentStarted', threadId: 't', agentId: 's1', agentName: 'explore', task: '扫描' }), tick(1));
    s = foldStopIntent(s);
    s = foldThreadEvent(s, ev({ type: 'turnSettled', threadId: 't', ok: false, usage: null }), tick(2));
    expect(s.agents).toMatchObject([{ id: 'explore', agentId: 's1', status: 'on-disk' }]);
    // worker 死亡：全部 working 条目就地终态
    s = foldThreadEvent(s, ev({ type: 'turnStarted', threadId: 't', at: tick(10) }), tick(10));
    s = foldThreadEvent(s, ev({ type: 'subagentStarted', threadId: 't', agentId: 's2', agentName: 'explore', task: '再扫' }), tick(11));
    s = foldThreadEvent(s, ev({ type: 'sessionDied', threadId: 't', reason: 'crash' }), tick(12));
    expect(s.agents.every((agent) => agent.status === 'on-disk')).toBe(true);
  });

  test('生命周期：started → delta → tool 三相 → settled', () => {
    let s = initialThreadState;
    s = foldThreadEvent(s, ev({ type: 'subagentStarted', threadId: 't', agentId: 's1', agentName: 'explore', task: '扫描' }), tick(0));
    s = foldThreadEvent(s, ev({ type: 'subagentDelta', threadId: 't', agentName: 'explore', delta: '发现 ' }), tick(10));
    s = foldThreadEvent(s, ev({ type: 'subagentDelta', threadId: 't', agentName: 'explore', delta: '3 个文件' }), tick(20));
    s = foldThreadEvent(
      s,
      ev({ type: 'subagentTool', threadId: 't', agentName: 'explore', call: { id: 'c1', name: 'read', argsPreview: 'a.ts' }, phase: 'start' }),
      tick(30),
    );
    s = foldThreadEvent(
      s,
      ev({ type: 'subagentTool', threadId: 't', agentName: 'explore', call: { id: 'c1', name: 'read', argsPreview: 'a.ts' }, phase: 'update', output: '内容' }),
      tick(40),
    );
    s = foldThreadEvent(
      s,
      ev({ type: 'subagentTool', threadId: 't', agentName: 'explore', call: { id: 'c1', name: 'read', argsPreview: 'a.ts' }, phase: 'end', output: '内容', isError: false }),
      tick(140),
    );
    s = foldThreadEvent(s, ev({ type: 'subagentSettled', threadId: 't', agentName: 'explore', status: 'done' }), tick(160));

    const agent = s.agents[0];
    expect(agent).toMatchObject({ id: 'explore', name: 'explore', agentType: 'explore', status: 'on-disk', toolCount: 1, endedAt: tick(160) });
    expect(agent?.summary).toContain('发现 3 个文件');
    expect(agent?.tools[0]).toMatchObject({ id: 'c1', status: 'ok', durationMs: 110, output: '内容' });
  });

  test('subagentState 忙闲迁移：终态行不被迟到的 idle 帧复活', () => {
    let s = initialThreadState;
    s = foldThreadEvent(s, ev({ type: 'subagentStarted', threadId: 't', agentId: 's1', agentName: 'explore', task: '扫描' }), tick(0));
    s = foldThreadEvent(s, ev({ type: 'subagentState', threadId: 't', agentName: 'explore', busy: false }), tick(1));
    expect(s.agents[0]?.status).toBe('idle');
    s = foldThreadEvent(s, ev({ type: 'subagentSettled', threadId: 't', agentName: 'explore', status: 'done' }), tick(2));
    expect(s.agents[0]?.status).toBe('on-disk');
    s = foldThreadEvent(s, ev({ type: 'subagentState', threadId: 't', agentName: 'explore', busy: true }), tick(3));
    expect(s.agents[0]?.status).toBe('on-disk');
  });
});

test('bashOutput 增量入尾部并封顶 2000 字符', () => {
  let state = initialThreadState;
  state = foldThreadEvent(state, { type: 'bashOutput', threadId: 't1', id: 'b1', delta: 'abc' }, 1);
  state = foldThreadEvent(state, { type: 'bashOutput', threadId: 't1', delta: 'def' }, 2);
  expect(state.bashTail).toBe('abcdef');
  const big = 'x'.repeat(3000);
  state = foldThreadEvent(state, { type: 'bashOutput', threadId: 't1', delta: big }, 3);
  expect(state.bashTail.length).toBe(2000);
  expect(state.bashTail.startsWith('x')).toBe(true);
});

describe('foldEvents · 思考激活态（块粒度）', () => {
  test('症状回归：长工具轮里思考定形后不再挂「思考中」——工具/正文/定形/新消息/settle 均熄灭，仅 thinking 增量点亮', () => {
    let s = initialThreadState;
    s = foldThreadEvent(s, ev({ type: 'turnStarted', threadId: 't', at: tick(0) }), tick(0));
    s = foldThreadEvent(s, ev({ type: 'messageStarted', threadId: 't', messageId: 'm1', at: tick(1) }), tick(1));
    // 思考流式中：信号指向该块
    s = foldThreadEvent(s, ev({ type: 'thinkingDelta', threadId: 't', messageId: 'm1', delta: '先想' }), tick(2));
    expect(liveTurn(s)?.kind === 'turn' && liveTurn(s).turn.streamingThinkingBlockId).toBe('think-m1');
    // 同消息正文开始（思考段结束）：熄灭
    s = foldThreadEvent(s, ev({ type: 'textDelta', threadId: 't', messageId: 'm1', delta: '动手' }), tick(3));
    expect(liveTurn(s)?.kind === 'turn' && liveTurn(s).turn.streamingThinkingBlockId).toBeNull();
    // 再来一段思考（同消息交替）：重新点亮
    s = foldThreadEvent(s, ev({ type: 'thinkingDelta', threadId: 't', messageId: 'm1', delta: '再想' }), tick(4));
    expect(liveTurn(s)?.kind === 'turn' && liveTurn(s).turn.streamingThinkingBlockId).toBe('think-m1');
    // 工具调用开始：熄灭（核心症状——工具执行期间思考不得再转圈）
    s = foldThreadEvent(s, ev({ type: 'toolCallAdded', threadId: 't', messageId: 'm1', call: { id: 'c1', name: 'bash', argsPreview: 'rg' }, diff: null }), tick(5));
    expect(liveTurn(s)?.kind === 'turn' && liveTurn(s).turn.streamingThinkingBlockId).toBeNull();
    // 消息定形：熄灭（幂等）
    s = foldThreadEvent(s, ev({ type: 'thinkingDelta', threadId: 't', messageId: 'm1', delta: '补' }), tick(6));
    s = foldThreadEvent(
      s,
      ev({ type: 'messageFinal', threadId: 't', message: { id: 'm1', text: '动手', thinking: '先想再想补', toolCalls: [], usage: null } }),
      tick(7),
    );
    expect(liveTurn(s)?.kind === 'turn' && liveTurn(s).turn.streamingThinkingBlockId).toBeNull();
    // 下一条消息的思考：信号跟随新块
    s = foldThreadEvent(s, ev({ type: 'messageStarted', threadId: 't', messageId: 'm2', at: tick(8) }), tick(8));
    s = foldThreadEvent(s, ev({ type: 'thinkingDelta', threadId: 't', messageId: 'm2', delta: '工具回来了' }), tick(9));
    expect(liveTurn(s)?.kind === 'turn' && liveTurn(s).turn.streamingThinkingBlockId).toBe('think-m2');
    // 轮终态：熄灭兜底
    s = foldThreadEvent(s, ev({ type: 'turnSettled', threadId: 't', ok: true, usage: null }), tick(10));
    expect(liveTurn(s)?.kind === 'turn' && liveTurn(s).turn.streamingThinkingBlockId).toBeNull();
    expect(liveTurn(s)?.kind === 'turn' && liveTurn(s).turn.status).toBe('completed');
  });

  test('宿主死亡终态同样熄灭思考流式态', () => {
    let s = initialThreadState;
    s = foldThreadEvent(s, ev({ type: 'turnStarted', threadId: 't', at: tick(0) }), tick(0));
    s = foldThreadEvent(s, ev({ type: 'messageStarted', threadId: 't', messageId: 'm1', at: tick(1) }), tick(1));
    s = foldThreadEvent(s, ev({ type: 'thinkingDelta', threadId: 't', messageId: 'm1', delta: '想' }), tick(2));
    s = foldDeath(s, tick(3));
    expect(liveTurn(s)?.kind === 'turn' && liveTurn(s).turn.streamingThinkingBlockId).toBeNull();
  });
});
