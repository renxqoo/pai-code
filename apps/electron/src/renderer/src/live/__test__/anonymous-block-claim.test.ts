import { describe, expect, test } from 'bun:test';

import type { InflightView, UiEvent } from '@paiapp/contracts';

import { createLiveController } from '../live-controller';
import { foldThreadEvent } from '../fold-events';
import { foldHydrate } from '../fold-hydrate';
import { initialThreadState, type LiveThreadState } from '../live-thread-state';
import { createLiveStore, type LiveStore } from '../store';
import { claimAnonymousBlocks } from '../turn-ops';
import type { ToolCallModel, TurnBlock } from '@/thread/thread-model';
import type { SessionView } from '@paiapp/contracts';
import type { BridgeClient } from '../client-invoke';

/**
 * 症状回归「多次刷新后消息只显示中段片段」（T35 §12，2026-09-12）：
 * wire 剥离（event-strip）使重载后续上的增量全部空 messageId，身份确立前折成
 * 匿名块（think-/text-/tools-）；读口快照 / messageFinal 建立身份时必须认领它们，
 * 否则孤儿中段片段永久滞留（同一条消息渲染成两个体）。全部用例以真实 wire 形态
 * （空 messageId）驱动——既有用例全带显式 id，正是假绿来源。
 */

type Outcome = { ok: true; data: unknown } | { ok: false; reason: string };

type ScriptedClient = BridgeClient & {
  calls: Array<{ method: string; params: unknown }>;
  emitToController: (event: unknown) => void;
};

function makeClient(script: (method: string, params: Record<string, unknown>) => Outcome | Promise<Outcome>): ScriptedClient {
  const calls: Array<{ method: string; params: unknown }> = [];
  let listener: ((events: readonly unknown[]) => void) | undefined;
  return {
    calls,
    available: true,
    emitToController: (event: unknown) => listener?.([event]),
    invoke: (method: string, params?: unknown) => {
      calls.push({ method, params: params ?? null });
      return Promise.resolve(script(method, (params ?? {}) as Record<string, unknown>)).then((outcome) => outcome as never);
    },
    subscribe: (onBatch: (events: readonly unknown[]) => void) => {
      listener = onBatch;
      return () => {
        listener = undefined;
      };
    },
  };
}

function sessionView(threadId: string, sessionPath: string): SessionView {
  return { threadId, cwd: '/w', sessionPath, title: `标题-${threadId}`, state: 'live', streaming: false, model: null, thinkingLevel: null, lastActivityAt: 1 };
}

const bootstrapOf = (sessions: SessionView[]): Outcome => ({
  ok: true,
  data: { sessions, saved: [], models: [], providers: [], preferences: { defaultModel: null, onboarded: true, projectModels: {}, pinnedSessions: [] }, hostPhase: 'ready' },
});

function bootStore(sessions: SessionView[]): LiveStore {
  const store = createLiveStore();
  store.getState().bootstrap((bootstrapOf(sessions) as { ok: true; data: unknown }).data as never);
  return store;
}

const waitMs = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

function inflightView(partial: Partial<InflightView> = {}): InflightView {
  return { turnStartEntryId: null, turnStartedAt: null, message: null, toolOutputs: [], bash: null, ...partial };
}

const ev = (event: UiEvent): UiEvent => event;

const FULL_THINKING = 'The user pasted a Baidu Finance URL for stock 300840. This is an A-share stock (创业板 ChiNext board, 300xxx). Let me get its info.';

/** live 轮的指定种类块文本（断言「只有一个思考块」用）。 */
function blockTexts(state: LiveThreadState, kind: 'text' | 'thinking'): string[] {
  const turn = state.items.find((item) => item.kind === 'turn' && item.turn.id === state.liveTurnId);
  return turn?.kind === 'turn' ? turn.turn.blocks.flatMap((block) => (block.kind === kind ? [block.text] : [])) : [];
}

function toolCallIds(state: LiveThreadState): string[] {
  const turn = state.items.find((item) => item.kind === 'turn' && item.turn.id === state.liveTurnId);
  return turn?.kind === 'turn' ? turn.turn.blocks.flatMap((block) => (block.kind === 'tools' ? block.calls.map((call) => call.id) : [])) : [];
}

describe('匿名块认领（空 id 增量在身份确立前折出的中转块）', () => {
  test('空 id 思考增量先到、读口快照后到：匿名块被认领，只剩一个思考块且 messageFinal 后为权威全文', () => {
    let state: LiveThreadState = { ...initialThreadState, streaming: true };
    // 重订阅落地：先收到一个批内折叠的空 id delta（用户现场的孤儿片段内容）
    state = foldThreadEvent(state, ev({ type: 'thinkingDelta', threadId: 't1', messageId: '', delta: '. This is an A-share stock (' }), 1);
    // 收敛读口随后带回在途快照（消息身份 messageTs=7 + 此刻已流出全文）
    state = foldHydrate(state, {
      kind: 'hydrate/inflight',
      view: inflightView({ turnStartEntryId: 'e0', message: { messageTs: 7, text: '', thinking: 'The user pasted a Baidu Finance URL for stock 300840. This is an A-share stock (', toolCalls: [] } }),
      at: 2,
    });
    // 身份确立后的增量直接进正确块
    state = foldThreadEvent(state, ev({ type: 'thinkingDelta', threadId: 't1', messageId: '', delta: '创业板 ChiNext board, 300xxx). Let me get its info.' }), 3);
    // 消息定形：权威替换
    state = foldThreadEvent(state, ev({ type: 'messageFinal', threadId: 't1', message: { id: '7', text: '正文', thinking: FULL_THINKING, toolCalls: [], usage: null } }), 4);

    expect(blockTexts(state, 'thinking')).toHaveLength(1);
    expect(blockTexts(state, 'thinking')[0]).toBe(FULL_THINKING);
  });

  test('老 hub（读口不可用）：空 id 增量的匿名块由 messageFinal 权威身份认领', () => {
    let state: LiveThreadState = { ...initialThreadState, streaming: true };
    state = foldThreadEvent(state, ev({ type: 'textDelta', threadId: 't1', messageId: '', delta: '半截正文，' }), 1);
    state = foldThreadEvent(state, ev({ type: 'textDelta', threadId: 't1', messageId: '', delta: '继续输出' }), 2);
    state = foldThreadEvent(state, ev({ type: 'messageFinal', threadId: 't1', message: { id: '9', text: '完整正文，继续输出', thinking: '', toolCalls: [], usage: null } }), 3);

    const texts = state.items.flatMap((item) => (item.kind === 'turn' ? item.turn.blocks.flatMap((block) => (block.kind === 'text' ? [block.text] : [])) : []));
    expect(texts).toHaveLength(1);
    expect(texts[0]).toBe('完整正文，继续输出');
  });

  test('空 id toolcall 增量先到、读口快照后到：同一 callId 不双渲染', () => {
    let state: LiveThreadState = { ...initialThreadState, streaming: true };
    state = foldThreadEvent(state, ev({ type: 'toolCallAdded', threadId: 't1', messageId: '', call: { id: 'c1', name: 'bash', argsPreview: 'rxstock quote 300840' }, diff: null }), 1);
    state = foldHydrate(state, {
      kind: 'hydrate/inflight',
      view: inflightView({ turnStartEntryId: 'e0', message: { messageTs: 7, text: '', thinking: '', toolCalls: [{ id: 'c1', name: 'bash', argsPreview: 'rxstock quote 300840' }] } }),
      at: 2,
    });

    expect(toolCallIds(state)).toEqual(['c1']);
  });

  test('编排级竞态：重订阅首批事件先于 ensureHydrated 的读口响应到达（用户多次刷新命中的时序）', async () => {
    const sessions = [sessionView('t1', '/w/s/t1.jsonl')];
    const client = makeClient((method) => {
      if (method === 'app/bootstrap') return bootstrapOf(sessions);
      if (method === 'session/inflight')
        return { ok: true, data: inflightView({ turnStartEntryId: 'e0', message: { messageTs: 7, text: '', thinking: 'The user pasted a Baidu Finance URL for stock 300840. This is an A-share stock (', toolCalls: [] } }) };
      if (method === 'session/entries') return { ok: true, data: { items: [], cursor: null } };
      return { ok: true, data: null };
    });
    const store = bootStore(sessions);
    store.getState().setActiveThread('t1');
    const controller = createLiveController(client, store);
    await controller.start();

    // 空 id 增量在读口响应之前进入订阅批次（真实 wire 形态）
    client.emitToController({ type: 'thinkingDelta', threadId: 't1', messageId: '', delta: '. This is an A-share stock (' });
    await controller.ensureHydrated('t1');
    await waitMs(0);
    client.emitToController({ type: 'thinkingDelta', threadId: 't1', messageId: '', delta: '创业板 ChiNext board, 300xxx). Let me get its info.' });
    client.emitToController({ type: 'messageFinal', threadId: 't1', message: { id: '7', text: '正文', thinking: FULL_THINKING, toolCalls: [], usage: null } });
    await waitMs(0);

    const thread = store.getState().threads['t1'] ?? initialThreadState;
    const thinking = thread.items.flatMap((item) => (item.kind === 'turn' ? item.turn.blocks.flatMap((block) => (block.kind === 'thinking' ? [block.text] : [])) : []));
    expect(thinking).toHaveLength(1);
    expect(thinking[0]).toBe(FULL_THINKING);
  });

  test('读口快照先到（Order A）：无匿名块路径不受影响（幂等，引用不变）', async () => {
    const sessions = [sessionView('t1', '/w/s/t1.jsonl')];
    const client = makeClient((method) => {
      if (method === 'app/bootstrap') return bootstrapOf(sessions);
      if (method === 'session/inflight')
        return { ok: true, data: inflightView({ turnStartEntryId: 'e0', message: { messageTs: 7, text: '', thinking: '快照先到', toolCalls: [] } }) };
      if (method === 'session/entries') return { ok: true, data: { items: [], cursor: null } };
      return { ok: true, data: null };
    });
    const store = bootStore(sessions);
    store.getState().setActiveThread('t1');
    const controller = createLiveController(client, store);
    await controller.start();

    await controller.ensureHydrated('t1');
    await waitMs(0);
    client.emitToController({ type: 'thinkingDelta', threadId: 't1', messageId: '', delta: '，增量随后' });
    await waitMs(0);

    const thread = store.getState().threads['t1'] ?? initialThreadState;
    expect(blockTexts(thread, 'thinking')).toEqual(['快照先到，增量随后']);
  });

  test('目标块已存在时归位即合并（append-only）且幂等（重复认领结果不变）', () => {
    const blocks: TurnBlock[] = [
      { kind: 'thinking', id: 'think-', text: 'ChiNext board).' },
      { kind: 'thinking', id: 'think-7', text: 'The user pasted. This is an A-share stock (创业板 ChiNext board).' },
    ];
    const claimed = claimAnonymousBlocks(blocks, '7');
    expect(claimed).toHaveLength(1);
    expect(claimed[0]).toEqual({ kind: 'thinking', id: 'think-7', text: 'The user pasted. This is an A-share stock (创业板 ChiNext board).' });
    // 无匿名块时原引用返回（幂等）
    expect(claimAnonymousBlocks(claimed, '7')).toBe(claimed);
  });

  test('tools 匿名块归位：目标存在按 callId 并集（live 调用整体保留），目标不存在改名', () => {
    const call = (id: string): ToolCallModel => ({
      id,
      name: 'bash',
      argsPreview: id,
      subagents: [],
      output: '',
      exitCode: null,
      durationMs: null,
      status: 'running',
    });
    const merged = claimAnonymousBlocks(
      [
        { kind: 'tools', id: 'tools-', calls: [call('c1')] },
        { kind: 'tools', id: 'tools-7', calls: [call('c1'), call('c2')] },
      ] as TurnBlock[],
      '7',
    );
    expect(merged).toHaveLength(1);
    expect(merged[0]?.kind === 'tools' ? merged[0].calls.map((item) => item.id) : []).toEqual(['c1', 'c2']);

    const renamed = claimAnonymousBlocks([{ kind: 'tools', id: 'tools-', calls: [call('c9')] }] as TurnBlock[], '7');
    expect(renamed[0]?.kind === 'tools' ? renamed[0].id : '').toBe('tools-7');
  });
});
