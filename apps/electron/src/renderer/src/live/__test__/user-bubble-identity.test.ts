import { describe, expect, test } from 'bun:test';

import { createEventMapper } from '@x3code/api/events/event-mapper';
import type { HistoryItem, SessionView, UiEvent } from '@x3code/contracts';

import { foldThreadEvent } from '../fold-events';
import { foldHydrate } from '../fold-hydrate';
import { bindEchoEntries, claimEchoes, pendingEchoes } from '../pending-echoes';
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

/** 症状链路复现（2026-10-03 WAL seq 13246/13247）：压缩摘要 replace 帧直通 → 误领
 * 乐观回显队首 → 真消息再达不收敛。mapper + fold + store + 回显认领全链——与
 * live-controller.onEvent 的认领路径同一条（帧侧此前缺 replace 门，条目侧一直有）。 */
describe('压缩摘要 replace 帧 × 乐观回显（链路级症状回归）', () => {
  const SUMMARY = ['<goals>', '- goal-a', '</goals>', '', 'The message above is an automatic continuation summary generated mid-task. Continue the current work directly. Do not recap the summary to the user and do not ask for confirmation.'].join('\n');

  test('症状回归「发一条消息出现两条相同气泡」：摘要帧不冒领回显，真消息按 seq 收敛', () => {
    const mapper = createEventMapper({ now: () => T });
    const store = createLiveStore();
    store.getState().bootstrap(bootstrapOf([session('t')]) as never);
    // 提交即回显（submitDraft 两段之一）：本地气泡 msg-local-1 在场，入队登记
    store.getState().echoPendingMessage('t', 'local-1', TEXT);
    pendingEchoes.set('t', [{ localId: 'local-1', text: TEXT }]);
    // 轮启动边沿：autocompact L2 摘要以 replace 型 user/message 落账（WAL 13246 形态）
    const summaryEvents = mapper.mapEvent({
      threadId: 't',
      name: 'user/message',
      payload: { seq: 13246, surfaceOp: { op: 'replace', startSeq: 10, endSeq: 103 }, turn: 1, step: 0, content: [{ type: 'text', text: SUMMARY }] },
    });
    expect(summaryEvents).toEqual([]);
    // 真用户消息帧（WAL 13249 形态）——唯一有权认领回显的帧
    const realEvents = mapper.mapEvent({
      threadId: 't',
      name: 'user/message',
      payload: { seq: 13249, turn: 47, step: 0, content: [{ type: 'text', text: TEXT }] },
    });
    // onEvent 认领路径：真认领单元（claimEchoes——与生产同一段代码，非测试重演）
    for (const event of [...summaryEvents, ...realEvents]) {
      store.getState().applyEvent(event, T);
      if (event.type === 'userMessage' && event.message.origin === 'user') {
        claimEchoes(store.getState(), 't', event.message.seq, event.message.claimedIds, event.message.userBlocks);
      }
    }
    const messages = (store.getState().threads['t'] ?? initialThreadState).items.filter((item) => item.kind === 'message');
    // 一条真消息 + 一条回显收敛到同一 seq 身份 = 恰好一条气泡；摘要全文不上屏
    const texts = messages.flatMap((item) => (item.kind === 'message' ? [item.message.text] : []));
    expect(texts).toEqual([TEXT]);
    expect(texts.some((t) => t.includes('<goals>'))).toBe(false);
    expect(messages[0]?.kind === 'message' ? messages[0].message.id : '').toBe('msg-seq-13249');
  });
});

/** 症状链路复现二（2026-10-01 WAL seq 8335/8337）：流式中连发两条并「立即改向」→
 * 两条回显在队；step 边界一次 claim 合并物化为**单帧** user/message（双 text 块）
 * → 帧只到达一次，FIFO 只认领队首一条，另一条回显永不收敛 = 重启即失的重复气泡。 */
describe('批量认领合并帧 × 乐观回显（链路级症状回归）', () => {
  const A = '为什么要这个文件';
  const B = '这里不是有了吗';

  test('症状回归「聊着聊着出现两条相同消息」：合并帧按块拆分认领全部在途回显', () => {
    const mapper = createEventMapper({ now: () => T });
    const store = createLiveStore();
    store.getState().bootstrap(bootstrapOf([session('t')]) as never);
    // 连发两条（各自回显、各自入队——与 submitDraft 同构）
    store.getState().echoPendingMessage('t', 'local-1', A);
    store.getState().echoPendingMessage('t', 'local-2', B);
    pendingEchoes.set('t', [
      { localId: 'local-1', text: A },
      { localId: 'local-2', text: B },
    ]);
    // 内核 appendUserBatch 把同批认领的多条输入合并成单帧（双 text 块——WAL 8337 形态）；
    // mapper 携带 userBlocks=2（输入条数来自帧结构，非换行计数）
    const frameEvents = mapper.mapEvent({
      threadId: 't',
      name: 'user/message',
      payload: { seq: 8337, turn: 33, step: 50, content: [{ type: 'text', text: A }, { type: 'text', text: B }] },
    });
    expect(frameEvents).toHaveLength(1);
    const frame = frameEvents[0];
    if (frame?.type !== 'userMessage') throw new Error('frame missing');
    expect(frame.message.userBlocks).toBe(2);
    store.getState().applyEvent(frame, T);
    // 认领：真单元（claimEchoes——与 onEvent 同一段代码，非测试重演）
    claimEchoes(store.getState(), 't', frame.message.seq, frame.message.claimedIds, frame.message.userBlocks);
    const messages = (store.getState().threads['t'] ?? initialThreadState).items.filter((item) => item.kind === 'message');
    const texts = messages.flatMap((item) => (item.kind === 'message' ? [item.message.text] : []));
    // 合并帧一条气泡（双输入拼合）+ 零孤儿回显（否则 B 的 msg-local-* 永不收敛，
    // 与合并气泡并存 = 用户所报「同样的消息两条」，重启后转写重建只剩一条）
    expect(texts).toEqual([`${A}\n${B}`]);
    const ids = messages.map((item) => (item.kind === 'message' ? item.message.id : ''));
    expect(ids.some((id) => id.startsWith('msg-local-'))).toBe(false);
  });

  test('症状回归「较新条目先物化」（立即改向时序）：claimedIds 精准配对，不错领别人的回显', () => {
    const mapper = createEventMapper({ now: () => T });
    const store = createLiveStore();
    store.getState().bootstrap(bootstrapOf([session('t')]) as never);
    // 流式中连发 M1、M2（两条回显），对 M2 点「立即改向」→ M2 先物化（内核双队列
    // 认领序 ≠ 提交序）。queueChanged 先把 inbox 条目 id 绑到回显（onEvent 同一条）。
    store.getState().echoPendingMessage('t', 'local-1', '消息一');
    store.getState().echoPendingMessage('t', 'local-2', '消息二');
    pendingEchoes.set('t', [
      { localId: 'local-1', text: '消息一' },
      { localId: 'local-2', text: '消息二' },
    ]);
    bindEchoEntries('t', [
      { id: 'entry-m1', text: '消息一' },
      { id: 'entry-m2', text: '消息二' },
    ]);
    // M2 单独物化（steer 路径）：帧携带 claimedIds=[entry-m2]（内核 user 标记条目）
    const frameEvents = mapper.mapEvent({
      threadId: 't',
      name: 'user/message',
      payload: { seq: 9001, turn: 5, step: 3, content: [{ type: 'text', text: '消息二' }], claimedIds: ['entry-m2'] },
    });
    const frame = frameEvents[0];
    if (frame?.type !== 'userMessage') throw new Error('frame missing');
    expect(frame.message.claimedIds).toEqual(['entry-m2']);
    store.getState().applyEvent(frame, T);
    claimEchoes(store.getState(), 't', frame.message.seq, frame.message.claimedIds, frame.message.userBlocks);
    // M2 的回显收敛；M1 的回显原封不动（它还在 next-turn 队列里，未被错领）
    const items = (store.getState().threads['t'] ?? initialThreadState).items.filter((item) => item.kind === 'message');
    const ids = items.map((item) => (item.kind === 'message' ? item.message.id : ''));
    expect(ids).toContain('msg-seq-9001');
    expect(ids).toContain('msg-local-1');
    expect(ids).not.toContain('msg-local-2');
    const bound = pendingEchoes.get('t') ?? [];
    expect(bound.map((slot) => slot.localId)).toEqual(['local-1']);
  });

  test('症状回归「空闲发送两条相同消息」（2026-10-05 WAL seq 2282/2286）：claimedIds 配对落空时退回 FIFO 认领', () => {
    const mapper = createEventMapper({ now: () => T });
    const store = createLiveStore();
    store.getState().bootstrap(bootstrapOf([session('t')]) as never);
    // 空闲发送：insert→claim 4ms 内完成，queueChanged 镜像（get_state 往返）
    // 回来时队列已空 —— bindEchoEntries 从未绑定，回显 entryId 缺席
    store.getState().echoPendingMessage('t', 'local-1', '现在如何本地启动服务');
    pendingEchoes.set('t', [{ localId: 'local-1', text: '现在如何本地启动服务' }]);
    // （不词 bindEchoEntries —— 镜像未及到达）
    const frameEvents = mapper.mapEvent({
      threadId: 't',
      name: 'user/message',
      payload: { seq: 2286, turn: 3, step: 0, content: [{ type: 'text', text: '现在如何本地启动服务' }], claimedIds: ['59fb627c-391e-45bd-8df6-2324878494ca'] },
    });
    const frame = frameEvents[0];
    if (frame?.type !== 'userMessage') throw new Error('frame missing');
    store.getState().applyEvent(frame, T);
    claimEchoes(store.getState(), 't', frame.message.seq, frame.message.claimedIds, frame.message.userBlocks);
    // 配对落空不得孤儿化回显：退回 FIFO 认领队首（认领是排他的——未绑定回显按队列序）
    const items = (store.getState().threads['t'] ?? initialThreadState).items.filter((item) => item.kind === 'message');
    const texts = items.flatMap((item) => (item.kind === 'message' ? [item.message.text] : []));
    expect(texts).toEqual(['现在如何本地启动服务']);
    expect(pendingEchoes.get('t')).toBeUndefined();
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
