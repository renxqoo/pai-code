import { describe, expect, test } from 'bun:test';

import type { InflightView, PreferencesView, SessionView } from '@paiapp/contracts';

import { createLiveController } from '../live-controller';
import { foldThreadEvent } from '../fold-events';
import { foldHydrate } from '../fold-hydrate';
import { createLiveStore, type LiveStore } from '../store';
import { applyInflight } from '../fold-inflight';
import type { HistoryItem, UiEvent } from '@paiapp/contracts';
import { initialThreadState, type LiveThreadState } from '../live-thread-state';
import type { BridgeClient } from '../client-invoke';

/**
 * T35 M2b：重载收敛（读口族接入折叠层与编排）。
 * 症状回归「单条消息流式中刷新」：重载前已流出的那条消息既未落盘、也不在事件流里，
 * 唯一来源是 `session/inflight` 的在途快照；合并必须是前缀取长者（不重复、不丢）。
 * 读序规则：内存态读（inflight）先、落盘读（entries）后——否则「恰在两读之间落盘」
 * 的消息两边都拿不到。降级：读口不可用（旧 hub / 探测失败）跳过且不崩、不唤醒 parked。
 */

type Outcome = { ok: true; data: unknown } | { ok: false; reason: string };

type ScriptedClient = BridgeClient & {
  calls: Array<{ method: string; params: unknown }>;
  emitToController: (event: unknown) => void;
};

function makeClient(script: (method: string, params: Record<string, unknown>) => Outcome | Promise<Outcome>): ScriptedClient {
  const calls: Array<{ method: string; params: unknown }> = [];
  let listener: ((event: unknown) => void) | undefined;
  return {
    calls,
    available: true,
    emitToController: (event: unknown) => listener?.(event),
    invoke: (method: string, params?: unknown) => {
      calls.push({ method, params: params ?? null });
      return Promise.resolve(script(method, (params ?? {}) as Record<string, unknown>)).then((outcome) => outcome as never);
    },
    subscribe: (onEvent: (event: unknown) => void) => {
      listener = onEvent;
      return () => {
        listener = undefined;
      };
    },
  };
}

function sessionView(threadId: string, state: SessionView['state'], sessionPath: string | null): SessionView {
  return { threadId, cwd: '/w', sessionPath, title: `标题-${threadId}`, state, streaming: false, model: null, thinkingLevel: null, lastActivityAt: 1 };
}

const preferences: PreferencesView = {
  defaultModel: null,
  onboarded: true,
  projectModels: {},
  pinnedSessions: [],
  trustedDefault: false,
  hiddenProjects: [],
  idleRecycleMinutes: 5,
  archivedSessions: [],
};

const bootstrapData = (sessions: SessionView[]) => ({
  sessions: [...sessions],
  saved: [],
  models: [],
  providers: [],
  preferences,
  hostPhase: 'ready' as const,
});

function bootStore(sessions: SessionView[]): LiveStore {
  const store = createLiveStore();
  store.getState().bootstrap(bootstrapData(sessions));
  return store;
}

const waitMs = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

function inflightView(partial: Partial<InflightView> = {}): InflightView {
  return { turnStartSeq: null, turnStartedAt: null, message: null, toolOutputs: [], bash: null, ...partial };
}

const tick = (n: number): number => n;

const ev = (event: UiEvent): UiEvent => event;

function history(partial: Partial<HistoryItem> & Pick<HistoryItem, 'id' | 'kind'>): HistoryItem {
  if (partial.kind === 'user') return { text: '', origin: 'user', images: [], at: 1, ...partial } as HistoryItem;
  if (partial.kind === 'assistant')
    return { text: '', thinking: '', toolCalls: [], usage: null, stopReason: null, errorMessage: null, at: 1, messageTs: 0, ...partial } as HistoryItem;
  return { command: '', output: '', exitCode: 0, cancelled: false, at: 1, ...partial } as HistoryItem;
}

function turnText(state: LiveThreadState): string {
  const parts: string[] = [];
  for (const item of state.items) {
    if (item.kind !== 'turn') continue;
    for (const block of item.turn.blocks) {
      if (block.kind === 'text' || block.kind === 'thinking') parts.push(block.text);
    }
  }
  return parts.join('\n');
}

const liveTurn = (state: LiveThreadState) => state.items.filter((item) => item.kind === 'turn');

describe('applyInflight · 在途快照合入（单条消息重载，M2b）', () => {
  test('症状回归「单条消息流式中刷新只剩半截」：快照补回重载前已流出的正文，取更长者', () => {
    // 重载后事件流只续上「后半」；快照带着「前半+后半」回来
    let state: LiveThreadState = { ...initialThreadState, streaming: true };
    state = applyInflight(
      state,
      inflightView({ turnStartSeq: 1, message: { messageTs: 7, text: '前半后半', thinking: '', toolCalls: [] } }),
      1_000,
    );
    expect(turnText(state)).toBe('前半后半');

    // 之后再来的增量（同一条消息的后续 delta）继续累积，不重复
    const block = liveTurn(state)[0];
    expect(block?.kind === 'turn' ? block.turn.id : '').toBe(state.liveTurnId);
  });

  test('快照比 live 短（落在 delta 之前）→ 保留更长的 live 文本', () => {
    const withDelta = applyInflight(
      { ...initialThreadState, streaming: true },
      inflightView({ message: { messageTs: 7, text: '前半', thinking: '', toolCalls: [] } }),
      1_000,
    );
    const merged = applyInflight(withDelta, inflightView({ message: { messageTs: 7, text: '前', thinking: '', toolCalls: [] } }), 1_001);
    expect(turnText(merged)).toBe('前半');
    expect(liveTurn(merged)).toHaveLength(1);
  });

  test('重复应用同一快照结果不变（幂等：刷新 + 切换会话两次收敛）', () => {
    const view = inflightView({
      turnStartSeq: 1,
      message: { messageTs: 7, text: '完整正文', thinking: '想了', toolCalls: [{ id: 'c1', name: 'bash', argsPreview: 'ls' }] },
    });
    const once = applyInflight({ ...initialThreadState, streaming: true }, view, 1_000);
    expect(applyInflight(once, view, 1_002)).toEqual(once);
  });

  test('工具在途输出：替换 live 的累积输出、status 归 running、时长由 startedAt 复原', () => {
    const withCall = applyInflight(
      { ...initialThreadState, streaming: true },
      inflightView({ turnStartSeq: 1, message: { messageTs: 7, text: '跑工具', thinking: '', toolCalls: [{ id: 'c1', name: 'bash', argsPreview: 'bun test' }] } }),
      1_000,
    );
    const merged = applyInflight(
      withCall,
      inflightView({ turnStartSeq: 1, toolOutputs: [{ callId: 'c1', output: '3 pass', truncated: false, startedAt: 500 }] }),
      1_500,
    );
    const block = liveTurn(merged)[0];
    const calls = block?.kind === 'turn' ? block.turn.blocks.flatMap((item) => (item.kind === 'tools' ? item.calls : [])) : [];
    expect(calls[0]?.output).toBe('3 pass');
    expect(calls[0]?.status).toBe('running');
    expect(calls[0]?.durationMs).toBe(1_000);
    // 工具块早于文本块之外的位置不变：仍只有一个轮
    expect(liveTurn(merged)).toHaveLength(1);
  });

  test('bash 在途：横幅可重建（bashRunning 点亮；轮起点事实不受 bash 影响）', () => {
    const state = applyInflight(
      { ...initialThreadState },
      inflightView({ bash: { id: 'bash-1', command: 'pytest', startedAt: 900 } }),
      1_000,
    );
    expect(state.bashRunning).toBe(true);
    expect(state.turnStartSeq).toBeNull();
  });

  test('空形态（无在途轮）不改变视图，只更新轮起点事实', () => {
    const base: LiveThreadState = { ...initialThreadState, turnStartSeq: 9 };
    const state = applyInflight(base, inflightView({}), 1_000);
    expect(state.items).toEqual(base.items);
    expect(state.turnStartSeq).toBeNull();
    expect(state.streaming).toBe(false);
  });

  test('轮起点非空 = 轮在途：streaming 置真（重载后未收到任何事件时也不把新消息误判为空闲）', () => {
    const state = applyInflight({ ...initialThreadState }, inflightView({ turnStartSeq: 1 }), 1_000);
    expect(state.streaming).toBe(true);
    expect(state.turnStartSeq).toBe(1);
  });
});

describe('重载收敛链（读序 + 降级，M2b）', () => {
  test('症状回归「单条消息流式中刷新」：in-flight 读带回在途正文，视图不再只剩增量', async () => {
    const sessions = [sessionView('t1', 'live', '/w/s/t1.jsonl')];
    const client = makeClient((method) => {
      if (method === 'app/bootstrap') return { ok: true, data: bootstrapData(sessions) };
      if (method === 'session/inflight')
        return { ok: true, data: inflightView({ turnStartSeq: 1, message: { messageTs: 7, text: '重载前已流出的正文', thinking: '', toolCalls: [] } }) };
      if (method === 'session/entries') return { ok: true, data: { items: [], cursor: null } };
      return { ok: true, data: null };
    });
    const store = bootStore(sessions);
    store.getState().setActiveThread('t1');
    const controller = createLiveController(client, store);
    await controller.start();

    // 重载后事件流续上：只剩重载后的增量
    client.emitToController({ type: 'textDelta', threadId: 't1', messageId: '7', delta: '，之后的增量' });
    await controller.ensureHydrated('t1');
    await waitMs(0);

    expect(turnText(store.getState().threads['t1'] ?? initialThreadState)).toContain('重载前已流出的正文');
    expect(turnText(store.getState().threads['t1'] ?? initialThreadState)).toContain('之后的增量');
  });

  test('读序规则：in-flight 先于 entries（恰在两读之间落盘的消息由后读的 entries 兜住）', async () => {
    const sessions = [sessionView('t1', 'live', '/w/s/t1.jsonl')];
    let inflightRead = false;
    const persisted = { kind: 'assistant', id: 'seq-9', messageTs: 9, text: '刚落盘的一条', thinking: '', toolCalls: [], usage: null, stopReason: null, errorMessage: null, at: 2 };
    const client = makeClient((method) => {
      if (method === 'app/bootstrap') return { ok: true, data: bootstrapData(sessions) };
      if (method === 'session/inflight') {
        inflightRead = true;
        return { ok: true, data: inflightView({ turnStartSeq: 8 }) };
      }
      if (method === 'session/entries') {
        // 该消息恰在 inflight 读之后、entries 读之前落盘：先读 entries 就永远看不到它
        return { ok: true, data: { items: inflightRead ? [persisted] : [], cursor: 9 } };
      }
      return { ok: true, data: null };
    });
    const store = bootStore(sessions);
    store.getState().setActiveThread('t1');
    const controller = createLiveController(client, store);
    await controller.start();

    await controller.ensureHydrated('t1');
    await waitMs(0);

    expect(turnText(store.getState().threads['t1'] ?? initialThreadState)).toContain('刚落盘的一条');
  });

  test('读口不可用（旧 hub：命令 failure）→ 跳过且不崩，entries 仍按既有路径水化', async () => {
    const sessions = [sessionView('t1', 'live', '/w/s/t1.jsonl')];
    const persisted = { kind: 'assistant', id: 'seq-1', messageTs: 1, text: '已落盘', thinking: '', toolCalls: [], usage: null, stopReason: null, errorMessage: null, at: 2 };
    const client = makeClient((method) => {
      if (method === 'app/bootstrap') return { ok: true, data: bootstrapData(sessions) };
      if (method === 'session/inflight') return { ok: false, error: { kind: 'unknown_command', message: 'get_inflight' } };
      if (method === 'session/subagents' || method === 'session/pendingDialogs') return { ok: false, error: { kind: 'unknown_command' } };
      if (method === 'session/entries') return { ok: true, data: { items: [persisted], cursor: 1 } };
      return { ok: true, data: null };
    });
    const store = bootStore(sessions);
    store.getState().setActiveThread('t1');
    const controller = createLiveController(client, store);
    await controller.start();

    await controller.ensureHydrated('t1');
    await waitMs(0);

    expect(turnText(store.getState().threads['t1'] ?? initialThreadState)).toContain('已落盘');
    // 探测器只探一次：后续激活不再重发（缓存「不可用」）
    const before = client.calls.filter((call) => call.method === 'session/inflight').length;
    await controller.ensureHydrated('t1', { force: true });
    await waitMs(0);
    expect(client.calls.filter((call) => call.method === 'session/inflight').length).toBe(before);
  });

  test('症状回归「结算后 host 报空在途面」：不建轮、streaming 不滞留（守卫与空形态各司其职）', async () => {
    const sessions = [sessionView('t1', 'live', '/w/s/t1.jsonl')];
    const client = makeClient((method) => {
      if (method === 'app/bootstrap') return { ok: true, data: bootstrapData(sessions) };
      if (method === 'session/inflight') return { ok: true, data: inflightView({}) };
      if (method === 'session/entries') return { ok: true, data: { items: [], cursor: null } };
      return { ok: true, data: null };
    });
    const store = bootStore(sessions);
    store.getState().setActiveThread('t1');
    const controller = createLiveController(client, store);
    await controller.start();

    client.emitToController({ type: 'turnSettled', threadId: 't1', ok: true, usage: null });
    await controller.ensureHydrated('t1');
    await waitMs(0);

    const thread = store.getState().threads['t1'] ?? initialThreadState;
    expect(thread.streaming).toBe(false);
    expect(thread.liveTurnId).toBeNull();
  });

  test('症状回归「重载后直接执行的 bash 结果条目不出现、横幅常亮」（fb-8）：输出静默后用读口收尾并补拉条目', async () => {
    const sessions = [sessionView('t1', 'live', '/w/s/t1.jsonl')];
    const persisted = { kind: 'bash', id: 'seq-5', command: 'bun test', output: '3 pass', exitCode: 0, cancelled: false, at: 5 };
    let bashRunning = true;
    const client = makeClient((method) => {
      if (method === 'app/bootstrap') return { ok: true, data: bootstrapData(sessions) };
      if (method === 'session/inflight')
        return {
          ok: true,
          data: inflightView(bashRunning ? { bash: { id: 'bash-1', command: 'bun test', startedAt: 1 } } : {}),
        };
      if (method === 'session/entries') return { ok: true, data: { items: [persisted], cursor: 5 } };
      return { ok: true, data: null };
    });
    const store = bootStore(sessions);
    store.getState().setActiveThread('t1');
    const controller = createLiveController(client, store);
    await controller.start();

    // 重载后：旧渲染层的 bash 续体已消亡，只剩增量帧（横幅无本地登记 → 点亮 + 排探测）
    client.emitToController({ type: 'bashOutput', threadId: 't1', id: 'bash-1', delta: '3 pass' });
    expect(store.getState().threads['t1']?.bashRunning).toBe(true);

    // 命令结束：读口回报无在途 bash → 熄灭横幅并拉一次转写
    bashRunning = false;
    await waitMs(800);
    await waitMs(0);

    expect(store.getState().threads['t1']?.bashRunning).toBe(false);
    const text = (store.getState().threads['t1']?.items ?? [])
      .flatMap((item) => (item.kind === 'turn' ? item.turn.blocks.flatMap((block) => (block.kind === 'tools' ? block.calls.map((call) => call.output) : [])) : []))
      .join('\n');
    expect(text).toContain('3 pass');
  });

  test('parked 会话不发起读口探测（读不唤醒：探测不得把 parked 拽起来）', async () => {
    const sessions = [sessionView('t1', 'parked', '/w/s/t1.jsonl')];
    const client = makeClient((method) => {
      if (method === 'app/bootstrap') return { ok: true, data: bootstrapData(sessions) };
      if (method === 'session/register') return { ok: true, data: sessionView('t1', 'parked', '/w/s/t1.jsonl') };
      if (method === 'session/entries') return { ok: true, data: { items: [], cursor: null } };
      return { ok: true, data: null };
    });
    const store = bootStore(sessions);
    store.getState().setActiveThread('t1');
    const controller = createLiveController(client, store);
    await controller.start();

    await controller.ensureHydrated('t1');
    await waitMs(0);

    const methods = client.calls.map((call) => call.method);
    expect(methods).not.toContain('session/inflight');
    expect(methods).not.toContain('session/subagents');
    expect(methods).not.toContain('session/pendingDialogs');
  });

  test('症状回归「子代理在途弹窗重载后丢失」：读口带回的 grandchild 弹窗按实时帧同口径重建（agentName 归位）', async () => {
    const sessions = [sessionView('t1', 'live', '/w/s/t1.jsonl')];
    const client = makeClient((method) => {
      if (method === 'app/bootstrap') return { ok: true, data: bootstrapData(sessions) };
      if (method === 'session/inflight') return { ok: true, data: inflightView({}) };
      if (method === 'session/subagents') return { ok: true, data: { subagents: [] } };
      if (method === 'session/pendingDialogs')
        return {
          ok: true,
          data: {
            dialogs: [
              {
                requestId: 'req-sub-1',
                threadId: 't1',
                method: 'confirm',
                payload: { tool: 'bash', summary: 'echo hi', agentName: 'explore' },
              },
            ],
          },
        };
      if (method === 'session/entries') return { ok: true, data: { items: [], cursor: null } };
      return { ok: true, data: null };
    });
    const store = bootStore(sessions);
    store.getState().setActiveThread('t1');
    const controller = createLiveController(client, store);
    await controller.start();

    await controller.ensureHydrated('t1');
    await waitMs(0);

    const rebuilt = store.getState().dialogs.find((dialog) => dialog.requestId === 'req-sub-1');
    expect(rebuilt).toEqual({
      requestId: 'req-sub-1',
      threadId: 't1',
      method: 'confirm',
      tool: 'bash',
      summary: 'echo hi',
      agentName: 'explore',
    });
    // 应答走同一条结算路径（ui_response 按 requestId 寻址，与实时帧无差别）
    await controller.respondDialog('req-sub-1', { confirmed: true });
    expect(store.getState().dialogs.some((dialog) => dialog.requestId === 'req-sub-1')).toBe(false);
  });
});

describe('对抗审查补强（T35 复审）', () => {
  test('症状回归「轮内注入 user 消息把同一轮切成两个」：span 归属按读口边界（turnStartSeq）而非末位用户消息', () => {
    // 转写：上轮末条目 seq-1 → 本轮 m1(assistant seq-2) → 轮内注入 user(seq-3)
    let state: LiveThreadState = initialThreadState;
    state = foldThreadEvent(state, ev({ type: 'messageStarted', threadId: 't', messageId: '1001', at: tick(1) }), tick(1));
    state = foldThreadEvent(state, ev({ type: 'textDelta', threadId: 't', messageId: '1001', delta: 'm1流式' }), tick(2));
    const derived = [
      history({ kind: 'assistant', id: 'seq-2', messageTs: 1001, text: 'm1权威' }),
      history({ kind: 'user', id: 'seq-3', text: '[task-notification] 注入' }),
    ] as never;
    state = foldHydrate(state, { kind: 'hydrate/inflight', view: inflightView({ turnStartSeq: 1 }), at: tick(3) });
    state = foldHydrate(state, { kind: 'hydrate/reconcile', items: derived, cursor: 3, dropLiveTurn: false });

    const turns = state.items.filter((item) => item.kind === 'turn');
    expect(turns).toHaveLength(1);
    expect(turns[0]?.kind === 'turn' && turns[0].turn.id).toBe(state.liveTurnId);
    expect(turnText(state)).toContain('m1权威');
  });

  test('症状回归「快照新于已收增量时正文重复」：快照是 live 的后缀 → 取快照', () => {
    const withDelta = applyInflight({ ...initialThreadState, streaming: true }, inflightView({ turnStartSeq: 1, message: { messageTs: 7, text: 'B', thinking: '', toolCalls: [] } }), 1_000);
    const merged = applyInflight(withDelta, inflightView({ turnStartSeq: 1, message: { messageTs: 7, text: 'AB', thinking: '', toolCalls: [] } }), 1_100);
    expect(turnText(merged)).toBe('AB');
  });

  test('症状回归「工具执行中刷新：工具卡假完成」：无在途消息也建轮，且转写说完成/读口说在跑 → running', () => {
    // 读口：轮在途、无在途消息、但工具仍在跑
    let state = applyInflight(
      initialThreadState,
      inflightView({ turnStartSeq: 1, toolOutputs: [{ callId: 'c1', output: 'line1', truncated: false, startedAt: 900 }] }),
      1_000,
    );
    expect(state.liveTurnId).not.toBeNull();
    // 转写随后带回该 assistant（含工具调用，无 toolResult）——不得插成独立历史轮
    const derived = [history({ kind: 'assistant', id: 'seq-2', messageTs: 1001, text: '', toolCalls: [{ id: 'c1', name: 'bash', argsPreview: 'bun test', output: '', isError: false, diff: null }] })] as never;
    state = foldHydrate(state, { kind: 'hydrate/reconcile', items: derived, cursor: 2, dropLiveTurn: false });
    const turns = state.items.filter((item) => item.kind === 'turn');
    expect(turns).toHaveLength(1);
    const calls = turns[0]?.kind === 'turn' ? turns[0].turn.blocks.flatMap((block) => (block.kind === 'tools' ? block.calls : [])) : [];
    expect(calls[0]?.status).toBe('running');
    expect(calls[0]?.output).toBe('line1');
  });

  test('症状回归「读在途期间结算 → 迟到快照不得重新点亮该轮」', async () => {
    const sessions = [sessionView('t1', 'live', '/w/s/t1.jsonl')];
    let release: (outcome: Outcome) => void = () => undefined;
    const gate = new Promise<Outcome>((resolve) => {
      release = resolve;
    });
    const client = makeClient((method) => {
      if (method === 'app/bootstrap') return { ok: true, data: bootstrapData(sessions) };
      if (method === 'session/inflight') return gate;
      if (method === 'session/entries') return { ok: true, data: { items: [], cursor: null } };
      return { ok: true, data: null };
    });
    const store = bootStore(sessions);
    store.getState().setActiveThread('t1');
    const controller = createLiveController(client, store);
    await controller.start();

    const hydrating = controller.ensureHydrated('t1');
    await waitMs(0);
    // 读发出之后、响应落地之前该轮结算（真实竞态窗口）
    client.emitToController({ type: 'turnSettled', threadId: 't1', ok: true, usage: null });
    release({ ok: true, data: inflightView({ turnStartSeq: 1, message: { messageTs: 7, text: '过期在途', thinking: '', toolCalls: [] } }) });
    await hydrating;
    await waitMs(0);

    const thread = store.getState().threads['t1'] ?? initialThreadState;
    expect(thread.streaming).toBe(false);
    expect(turnText(thread)).not.toContain('过期在途');
  });

  test('结算后的空形态不得点亮任何轮（host 应答反映读取时刻）', async () => {
    const sessions = [sessionView('t1', 'live', '/w/s/t1.jsonl')];
    const client = makeClient((method) => {
      if (method === 'app/bootstrap') return { ok: true, data: bootstrapData(sessions) };
      if (method === 'session/inflight') return { ok: true, data: inflightView({}) };
      if (method === 'session/entries') return { ok: true, data: { items: [], cursor: null } };
      return { ok: true, data: null };
    });
    const store = bootStore(sessions);
    store.getState().setActiveThread('t1');
    const controller = createLiveController(client, store);
    await controller.start();

    client.emitToController({ type: 'turnSettled', threadId: 't1', ok: true, usage: null });
    await controller.ensureHydrated('t1');
    await waitMs(0);

    const thread = store.getState().threads['t1'] ?? initialThreadState;
    expect(thread.streaming).toBe(false);
    expect(thread.liveTurnId).toBeNull();
  });

  test('症状回归「轮在途但读口空在途面（消息定形与落盘之间的窗口）」：复拉一次 entries 兜底', async () => {
    const sessions = [sessionView('t1', 'live', '/w/s/t1.jsonl')];
    const persisted = { kind: 'assistant', id: 'seq-2', messageTs: 9, text: '刚落盘的一条', thinking: '', toolCalls: [], usage: null, stopReason: null, errorMessage: null, at: 2 };
    let entriesCalls = 0;
    const client = makeClient((method) => {
      if (method === 'app/bootstrap') return { ok: true, data: bootstrapData(sessions) };
      if (method === 'session/inflight') return { ok: true, data: inflightView({ turnStartSeq: 1 }) };
      if (method === 'session/entries') {
        entriesCalls += 1;
        // 首读落在两步窗口内（条目尚未可见），复拉时才可见
        return { ok: true, data: { items: entriesCalls > 1 ? [persisted] : [], cursor: 2 } };
      }
      return { ok: true, data: null };
    });
    const store = bootStore(sessions);
    store.getState().setActiveThread('t1');
    const controller = createLiveController(client, store);
    await controller.start();

    await controller.ensureHydrated('t1');
    await waitMs(0);

    expect(entriesCalls).toBeGreaterThan(1);
    expect(turnText(store.getState().threads['t1'] ?? initialThreadState)).toContain('刚落盘的一条');
  });
});

describe('用户现场回归（2026-09-11 夜：多次刷新后思考只剩碎片 + 计时从 0 开始）', () => {
  test('症状回归「刷新后思考只剩刷新后的碎片」：快照全文与 live 尾段合并后必须是完整思考', () => {
    // 刷新后事件流只续上尾段「to the」；快照带着完整思考（以尾段结尾）
    const withDelta = applyInflight(
      { ...initialThreadState, streaming: true },
      inflightView({ turnStartSeq: 1, message: { messageTs: 7, text: '', thinking: 'to the', toolCalls: [] } }),
      1_000,
    );
    const merged = applyInflight(
      withDelta,
      inflightView({ turnStartSeq: 1, message: { messageTs: 7, text: '', thinking: 'I need to check the file to the', toolCalls: [] } }),
      1_100,
    );
    expect(turnText(merged)).toBe('I need to check the file to the');
  });

  test('症状回归「上一轮结算事件先到，当前轮的在途快照被误丢」：快照只在读取期间结算才丢弃', async () => {
    const sessions = [sessionView('t1', 'live', '/w/s/t1.jsonl')];
    const client = makeClient((method) => {
      if (method === 'app/bootstrap') return { ok: true, data: bootstrapData(sessions) };
      if (method === 'session/inflight')
        return { ok: true, data: inflightView({ turnStartSeq: 1, message: { messageTs: 7, text: '本轮在途正文', thinking: '', toolCalls: [] } }) };
      if (method === 'session/entries') return { ok: true, data: { items: [], cursor: null } };
      return { ok: true, data: null };
    });
    const store = bootStore(sessions);
    store.getState().setActiveThread('t1');
    const controller = createLiveController(client, store);
    await controller.start();

    // 刷新后先收到「上一轮结算」事件（turnsSettled 从 0 变 1），随后收敛读到**当前轮**的在途快照
    client.emitToController({ type: 'turnSettled', threadId: 't1', ok: true, usage: null });
    await controller.ensureHydrated('t1');
    await waitMs(0);

    expect(turnText(store.getState().threads['t1'] ?? initialThreadState)).toContain('本轮在途正文');
  });

  test('老 hub 兜底：读口不给 turnStartedAt 时，live 轮计时锚点回填为本轮 prompt 时刻', () => {
    let state = applyInflight(
      { ...initialThreadState, streaming: true },
      inflightView({ turnStartSeq: 1 }),
      1_000_000,
    );
    state = foldHydrate(state, {
      kind: 'hydrate/reconcile',
      items: [history({ kind: 'user', id: 'seq-9', text: '本轮问', at: 400_000 })],
      cursor: 9,
      dropLiveTurn: false,
    });
    const turn = state.items.find((item) => item.kind === 'turn');
    expect(turn?.kind === 'turn' ? turn.turn.startedAt : 0).toBe(400_000);
  });

  test('症状回归「轮计时从 0 开始」：live 轮的 startedAt 取轮首事实（不是刷新时刻）', () => {
    const withTurn = applyInflight(
      { ...initialThreadState, streaming: true },
      inflightView({ turnStartSeq: 1, turnStartedAt: 500_000, message: { messageTs: 7, text: 'x', thinking: '', toolCalls: [] } }),
      1_000_000,
    );
    const turn = withTurn.items.find((item) => item.kind === 'turn');
    expect(turn?.kind === 'turn' ? turn.turn.startedAt : 0).toBe(500_000);
  });
});
