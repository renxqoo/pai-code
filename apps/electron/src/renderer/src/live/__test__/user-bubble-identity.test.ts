import { describe, expect, test } from 'bun:test';

import { createEventMapper } from '@paiapp/api/events/event-mapper';
import type { HistoryItem, SessionView, UiEvent } from '@paiapp/contracts';

import { foldThreadEvent } from '../fold-events';
import { foldHydrate } from '../fold-hydrate';
import { initialThreadState, type LiveThreadState } from '../live-thread-state';
import { createLiveStore } from '../store';

/**
 * 用户气泡身份同域（症状：发一条消息出现两条相同的气泡）。
 *
 * 同一 WAL 落账有两条到达路径：事件帧直通（~16ms，携带 seq）与条目对账
 * （转写展开）。两者身份必须同域，否则 `seenIds` 去重失效，同一句话渲染两遍。
 */

const T = 1_000;
const TEXT = '修复';

const ev = (event: UiEvent): UiEvent => event;

/** store 动作层用例的最小会话装配（bootstrap 种子——与 store.test.ts 同形）。 */
const session = (threadId: string): SessionView => ({
  threadId,
  cwd: '/w',
  sessionPath: null,
  title: 'T',
  state: 'live',
  streaming: false,
  model: null,
  thinkingLevel: null,
  lastActivityAt: 1,
});

function bootstrapOf(sessions: readonly SessionView[]): never {
  return {
    sessions: [...sessions],
    saved: [],
    models: [],
    providers: [],
    preferences: { defaultModel: null, onboarded: true, projectModels: {}, pinnedSessions: [], trustedDefault: false, hiddenProjects: [], idleRecycleMinutes: 5, archivedSessions: [] },
    hubSettings: null,
    hostPhase: 'ready',
  } as never;
}

function userEntry(id: string, text: string): HistoryItem {
  return { kind: 'user', id, text, origin: 'user', images: [], at: T } as HistoryItem;
}

function userFrame(seq: number, text: string, images: ReadonlyArray<{ type: 'image'; data: string; mediaType: string }> = []): UiEvent {
  return ev({ type: 'userMessage', threadId: 't', message: { seq, text, origin: 'user', images: [...images] } } as UiEvent);
}

function bubbles(state: LiveThreadState): readonly string[] {
  return state.items.filter((item) => item.kind === 'message').flatMap((item) => (item.kind === 'message' ? [item.message.text] : []));
}

describe('用户气泡身份同域（事件帧 / 条目对账 / 乐观回显三源）', () => {
  test('症状回归「一条消息两条相同气泡」：条目对账后事件帧到达不重复', () => {
    let s = foldHydrate(initialThreadState, { kind: 'hydrate/initial', items: [userEntry('seq-647', TEXT)], cursor: 647 });
    s = foldThreadEvent(s, userFrame(647, TEXT), T);
    expect(bubbles(s)).toEqual([TEXT]);
  });

  test('事件帧先到（生产常态）：条目对账到达不重复', () => {
    let s = foldThreadEvent(initialThreadState, userFrame(647, TEXT), T);
    s = foldHydrate(s, { kind: 'hydrate/reconcile', items: [userEntry('seq-647', TEXT)], cursor: 647, dropLiveTurn: false });
    expect(bubbles(s)).toEqual([TEXT]);
  });

  test('图片不被身份收敛吞掉：事件帧先到则图在', () => {
    const images = [{ type: 'image' as const, data: 'aGk=', mediaType: 'image/png' }];
    let s = foldThreadEvent(initialThreadState, userFrame(647, TEXT, images), T);
    const first = s.items.find((item) => item.kind === 'message');
    expect(first?.kind === 'message' ? first.message.images : []).toHaveLength(1);
    // 转写后到：身份同域被去重，事件帧已带的图不丢
    s = foldHydrate(s, { kind: 'hydrate/reconcile', items: [userEntry('seq-647', TEXT)], cursor: 647, dropLiveTurn: false });
    const merged = s.items.filter((item) => item.kind === 'message');
    expect(merged).toHaveLength(1);
    expect(merged[0]?.kind === 'message' ? merged[0].message.images : []).toHaveLength(1);
  });

  test('连发同文本消息各自成条（身份按 seq 分域，不按文本合并）', () => {
    let s = foldThreadEvent(initialThreadState, userFrame(647, TEXT), T);
    s = foldThreadEvent(s, userFrame(660, TEXT), T);
    expect(bubbles(s)).toEqual([TEXT, TEXT]);
  });

  test('缺 seq 的事件帧不发气泡（无从与条目对账同域——由转写承载）', () => {
    const s = foldThreadEvent(initialThreadState, ev({ type: 'userMessage', threadId: 't', message: { text: TEXT, origin: 'user', images: [] } } as UiEvent), T);
    expect(bubbles(s)).toEqual([]);
  });
});

/** 乐观回显 × 权威气泡（回执 seq 收敛）：store 动作层端到端（submitDraft 的两段）。 */
describe('乐观回显收敛（reconcileEcho——提交即上屏，权威到达同域）', () => {
  function threadOf(store: ReturnType<typeof createLiveStore>): LiveThreadState {
    return store.getState().threads['t'] ?? initialThreadState;
  }

  test('回执先到（转写未到）：本地气泡换成落账身份，不产生两条', () => {
    const store = createLiveStore();
    store.getState().bootstrap(bootstrapOf([session('t')]) as never);
    store.getState().echoPendingMessage('t', 'local-abc', TEXT);
    expect(bubbles(threadOf(store))).toEqual([TEXT]);
    store.getState().reconcileEcho('t', 'local-abc', 647);
    const items = threadOf(store).items.filter((item) => item.kind === 'message');
    expect(items).toHaveLength(1);
    expect(items[0]?.kind === 'message' ? items[0].message.id : '').toBe('msg-seq-647');
    // 随后事件帧/条目到达与该身份同键 → 去重
    expect(threadOf(store).seenIds.has('msg-seq-647')).toBe(true);
  });

  test('转写先到（权威气泡已在场）：reconcileEcho 只除名本地气泡，不撞出两条', () => {
    const store = createLiveStore();
    store.getState().bootstrap(bootstrapOf([session('t')]) as never);
    store.getState().echoPendingMessage('t', 'local-abc', TEXT);
    // 权威先到（事件帧路径）——转写/帧先于回执的常态
    store.getState().applyEvent(ev({ type: 'userMessage', threadId: 't', message: { seq: 647, text: TEXT, origin: 'user', images: [] } }), T);
    store.getState().reconcileEcho('t', 'local-abc', 647);
    const items = threadOf(store).items.filter((item) => item.kind === 'message');
    expect(items).toHaveLength(1);
    expect(items[0]?.kind === 'message' ? items[0].message.id : '').toBe('msg-seq-647');
  });

  test('回显带图：收敛后图片仍在（不被身份收敛吞掉）', () => {
    const store = createLiveStore();
    store.getState().bootstrap(bootstrapOf([session('t')]) as never);
    store.getState().echoPendingMessage('t', 'local-abc', TEXT, [{ data: 'aGk=', mimeType: 'image/png' }]);
    store.getState().reconcileEcho('t', 'local-abc', 647);
    const items = threadOf(store).items.filter((item) => item.kind === 'message');
    expect(items[0]?.kind === 'message' ? items[0].message.images : []).toHaveLength(1);
  });

  test('两条在途回显：各自认领自己的权威气泡（FIFO，不互相覆盖）', () => {
    const store = createLiveStore();
    store.getState().bootstrap(bootstrapOf([session('t')]) as never);
    // 连投两条（同文本也会连投——身份靠 seq 分域）
    store.getState().echoPendingMessage('t', 'local-1', TEXT);
    store.getState().echoPendingMessage('t', 'local-2', TEXT);
    expect(threadOf(store).items.filter((item) => item.kind === 'message')).toHaveLength(2);
    // 权威按提交序到达：先 647 后 660
    store.getState().reconcileEcho('t', 'local-1', 647);
    store.getState().reconcileEcho('t', 'local-2', 660);
    const items = threadOf(store).items.filter((item) => item.kind === 'message');
    expect(items.map((item) => (item.kind === 'message' ? item.message.id : ''))).toEqual(['msg-seq-647', 'msg-seq-660']);
  });
});

/** 直执行 bash（`! ` 命令）：信封同走两通道，渲染形态不同——必须只出一条（工具块）。 */
describe('直执行 bash 信封（渲染形态不同的双通道）', () => {
  const ENVELOPE = '[bash] $ ls\nfile-a';

  test('症状回归「直执行命令双渲染」：帧不发气泡，条目侧出工具块——合计一条', () => {
    // 帧侧：真 mapper 漏斗（生产形态——fold 只收到 mapper 的产出）
    const mapper = createEventMapper({ now: () => T });
    const frameEvents = mapper.mapEvent({
      threadId: 't',
      name: 'user/message',
      payload: { seq: 12, turn: 0, step: 0, origin: 'user', content: [{ type: 'text', text: ENVELOPE }] },
    });
    expect(frameEvents).toEqual([]); // 信封帧侧零事件
    let s = initialThreadState;
    for (const event of frameEvents) s = foldThreadEvent(s, event, T);
    // 条目侧：同一落账折为 bash 工具轮
    s = foldHydrate(s, {
      kind: 'hydrate/reconcile',
      items: [{ kind: 'bash', id: 'seq-12', command: 'ls', output: 'file-a', exitCode: 0, cancelled: false, at: T } as HistoryItem],
      cursor: 12,
      dropLiveTurn: false,
    });
    const kinds = s.items.map((item) => item.kind);
    expect(kinds).toEqual(['turn']); // 只有 bash 工具轮，无重复用户气泡
  });
});
