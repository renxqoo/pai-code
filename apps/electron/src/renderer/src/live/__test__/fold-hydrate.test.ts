import { describe, expect, test } from 'bun:test';

import { foldStopIntent, foldThreadEvent } from '../fold-events';
import { foldHydrate } from '../fold-hydrate';
import { initialThreadState, type LiveThreadState } from '../live-thread-state';
import type { HistoryItem, UiEvent } from '@paiapp/contracts';

/** 水化对账语义（窗口重建/在途轮归属）回归：从 fold-events.test.ts 拆出（一文件一事）。 */

const T = 1_000;
const tick = (n: number): number => T + n;

const ev = (event: UiEvent): UiEvent => event;

function history(partial: Partial<HistoryItem> & Pick<HistoryItem, 'id' | 'kind'>): HistoryItem {
  if (partial.kind === 'user') return { text: '', origin: 'user', images: [], at: T, ...partial } as HistoryItem;
  if (partial.kind === 'assistant') return { text: '', thinking: '', toolCalls: [], usage: null, stopReason: null, errorMessage: null, at: T, ...partial } as HistoryItem;
  return { command: '', output: '', exitCode: 0, cancelled: false, at: T, ...partial } as HistoryItem;
}

/** 视图可见文本：症状断言只看用户看得见的内容，不钉内部 id（id 命名随修法可变）。 */
function visibleText(state: LiveThreadState): string {
  const parts: string[] = [];
  for (const item of state.items) {
    if (item.kind === 'message') {
      parts.push(item.message.text);
      continue;
    }
    for (const block of item.turn.blocks) {
      if (block.kind === 'text' || block.kind === 'thinking') parts.push(block.text);
      if (block.kind === 'tools') for (const call of block.calls) parts.push(call.output);
    }
  }
  return parts.join('\n');
}

describe('foldHydrate · reconcile 拆轮防线（窗口重建语义）', () => {
  function liveTurnState(): ReturnType<typeof foldThreadEvent> {
    let s = foldHydrate(initialThreadState, {
      kind: 'hydrate/initial',
      items: [history({ kind: 'user', id: 'u1', text: '问' }), history({ kind: 'assistant', id: 'a1', text: '答', at: tick(1) })],
      cursor: 1,
    });
    s = foldThreadEvent(s, ev({ type: 'turnStarted', threadId: 't', at: tick(10) }), tick(10));
    s = foldThreadEvent(s, ev({ type: 'messageStarted', threadId: 't', messageId: 'm1', at: tick(11) }), tick(11));
    s = foldThreadEvent(s, ev({ type: 'textDelta', threadId: 't', messageId: 'm1', delta: '在途' }), tick(12));
    return s;
  }

  test('症状回归「空窗口吞掉刚结算轮」：载荷为空不得拆除当轮现场（转写未到位）', () => {
    let s = liveTurnState();
    s = foldStopIntent(s);
    s = foldThreadEvent(s, ev({ type: 'turnSettled', threadId: 't', ok: true, usage: null }), tick(20));
    const turnsBefore = s.items.filter((item) => item.kind === 'turn');
    s = foldHydrate(s, { kind: 'hydrate/reconcile', items: [], cursor: null, dropLiveTurn: true });
    const turns = s.items.filter((item) => item.kind === 'turn');
    expect(turns).toHaveLength(turnsBefore.length);
    // wasStopped 继承只随拆除发生：上一条历史轮保持 completed，不被误标
    expect((turns[0]?.kind === 'turn' ? turns[0].turn.status : null)).toBe('completed');
  });

  test('症状回归「流式中窗口重建拆掉在途轮」：streaming 中一律不拆（最后防线）', () => {
    let s = liveTurnState();
    expect(s.streaming).toBe(true);
    s = foldHydrate(s, {
      kind: 'hydrate/reconcile',
      items: [history({ kind: 'user', id: 'u2', text: '新' }), history({ kind: 'assistant', id: 'a2', text: '权', at: tick(15) })],
      cursor: 2,
      dropLiveTurn: true,
    });
    const turnIds = s.items.filter((item) => item.kind === 'turn').map((item) => (item.kind === 'turn' ? item.turn.id : ''));
    // 在途 live 轮保留；当轮的已落盘子消息（a2）归 live 轮——不插入独立轮
    // （插入即同轮双渲染），settle 权威重建统一收口
    expect(turnIds[turnIds.length - 1]).toBe(s.liveTurnId);
    expect(turnIds).not.toContain('turn-a2');
    expect(s.liveTurnId).not.toBeNull();
  });

  test('reconcile 置 hydrated：重载冷启动走 reconcile 保流式时守卫同样生效', () => {
    const s = foldHydrate(initialThreadState, {
      kind: 'hydrate/reconcile',
      items: [history({ kind: 'user', id: 'u1', text: '问' })],
      cursor: 1,
      dropLiveTurn: false,
    });
    expect(s.hydrated).toBe(true);
  });
});

describe('foldHydrate · 在途轮归属（重载回落防同轮双渲染）', () => {
  test('症状回归「重载后同一轮折叠分裂成 共工作/已工作 两个轮」：不拆轮对账遇 live 轮时尾 span 归 live 轮独占', () => {
    // 重载回落（错过 turnStarted）：事件流先折出 live 轮
    let s = initialThreadState;
    s = foldThreadEvent(s, ev({ type: 'userMessage', threadId: 't', message: { id: 'u1', text: '看一下天气', origin: 'user' } }), tick(0));
    s = foldThreadEvent(s, ev({ type: 'messageStarted', threadId: 't', messageId: 'm1', at: tick(1) }), tick(1));
    s = foldThreadEvent(s, ev({ type: 'textDelta', threadId: 't', messageId: 'm1', delta: '在途后半' }), tick(2));
    expect(s.streaming).toBe(true);
    expect(s.liveTurnId).not.toBeNull();

    // 冷启动全量拉补：转写含历史 + 在途轮已落盘前缀（a1 属本轮、非独立轮）
    s = foldHydrate(s, {
      kind: 'hydrate/reconcile',
      items: [
        history({ kind: 'user', id: 'u1', text: '看一下天气' }),
        history({ kind: 'assistant', id: 'a1', text: '在途前半', at: tick(1) }),
      ],
      cursor: 1,
      dropLiveTurn: false,
    });

    const turns = s.items.filter((item) => item.kind === 'turn');
    // 同一轮只允许一个渲染体：live 轮独占（持久前缀轮不落、已落的按 id 收回）
    expect(turns).toHaveLength(1);
    expect(turns[0]?.kind === 'turn' && turns[0].turn.id === s.liveTurnId).toBe(true);
    expect(s.liveTurnId).not.toBeNull();
  });

  test('持久前缀轮已先落库（拉补先于事件到达）时，后续同类对账按 id 收回（不误伤历史轮）', () => {
    // 拉补先落：items = [u1 回显, turn-a1(持久前缀), 历史 turn-h1]
    let s = foldHydrate(initialThreadState, {
      kind: 'hydrate/reconcile',
      items: [
        history({ kind: 'user', id: 'h0', text: '历史问' }),
        history({ kind: 'assistant', id: 'h1', text: '历史答', at: tick(1) }),
        history({ kind: 'user', id: 'u1', text: '本轮问' }),
        history({ kind: 'assistant', id: 'a1', text: '在途前半', at: tick(2) }),
      ],
      cursor: 1,
      dropLiveTurn: false,
    });
    expect(s.items.filter((item) => item.kind === 'turn')).toHaveLength(2);

    // 事件流随后折出 live 轮（错过 turnStarted 的在途轮）
    s = foldThreadEvent(s, ev({ type: 'messageStarted', threadId: 't', messageId: 'm1', at: tick(3) }), tick(3));
    s = foldThreadEvent(s, ev({ type: 'textDelta', threadId: 't', messageId: 'm1', delta: '在途后半' }), tick(4));
    expect(s.liveTurnId).not.toBeNull();

    // 补挂重定基对账（controller 在此场景派发）：同轮双渲染收回，历史轮保留
    s = foldHydrate(s, {
      kind: 'hydrate/reconcile',
      items: [
        history({ kind: 'user', id: 'h0', text: '历史问' }),
        history({ kind: 'assistant', id: 'h1', text: '历史答', at: tick(1) }),
        history({ kind: 'user', id: 'u1', text: '本轮问' }),
        history({ kind: 'assistant', id: 'a1', text: '在途前半', at: tick(2) }),
      ],
      cursor: 1,
      dropLiveTurn: false,
    });
    const turnIds = s.items.filter((item) => item.kind === 'turn').map((item) => (item.kind === 'turn' ? item.turn.id : ''));
    expect(turnIds).toHaveLength(2); // 历史轮 + live 轮（持久前缀轮被收回）
    expect(turnIds).toContain('turn-h1');
    expect(turnIds[turnIds.length - 1]).toBe(s.liveTurnId);
  });
});

/**
 * 刷新（渲染层重载）落在轮次进行中：事件流不重放、在途消息不落盘，
 * 本轮「已输出的内容」只能来自转写（本轮已落盘的完成消息）。对账不得把它丢掉。
 */
describe('foldHydrate · 刷新落在轮次进行中（本轮已输出内容必须留在视图内）', () => {
  // 转写 = 本轮已落盘前缀（前半：本轮已完成的 assistant 消息）；事件流 = 重载后的增量（后半）
  const transcript = [history({ kind: 'user', id: 'u1', text: '看一下天气' }), history({ kind: 'assistant', id: 'a1', text: '前半', at: tick(1) })];

  test('症状回归「刷新后已经输出的消息丢失，只剩最新输出」：事件先落（live 轮）再对账', () => {
    let s = foldThreadEvent(initialThreadState, ev({ type: 'turnStarted', threadId: 't', at: tick(1) }), tick(1));
    s = foldThreadEvent(s, ev({ type: 'messageStarted', threadId: 't', messageId: 'm2', at: tick(2) }), tick(2));
    s = foldThreadEvent(s, ev({ type: 'textDelta', threadId: 't', messageId: 'm2', delta: '后半' }), tick(3));

    s = foldHydrate(s, { kind: 'hydrate/reconcile', items: transcript, cursor: 1, dropLiveTurn: false });

    expect(visibleText(s)).toContain('前半');
    expect(visibleText(s)).toContain('后半');
    // 同一轮只允许一个渲染体（T34 §6.6 不变量）：合入在途轮，不是另起一轮
    expect(s.items.filter((item) => item.kind === 'turn')).toHaveLength(1);
  });

  test('症状回归「刷新后已经输出的消息先显示再消失」：对账先落（前缀轮）后事件到达，补挂重定基不得抹掉', () => {
    let s = foldHydrate(initialThreadState, { kind: 'hydrate/reconcile', items: transcript, cursor: 1, dropLiveTurn: false });
    expect(visibleText(s)).toContain('前半');

    s = foldThreadEvent(s, ev({ type: 'messageStarted', threadId: 't', messageId: 'm2', at: tick(3) }), tick(3));
    s = foldThreadEvent(s, ev({ type: 'textDelta', threadId: 't', messageId: 'm2', delta: '后半' }), tick(4));
    // controller 在「错过 turnStarted 的在途轮」场景派发的补挂重定基对账
    s = foldHydrate(s, { kind: 'hydrate/reconcile', items: transcript, cursor: 1, dropLiveTurn: false });

    expect(visibleText(s)).toContain('前半');
    expect(visibleText(s)).toContain('后半');
    expect(s.items.filter((item) => item.kind === 'turn')).toHaveLength(1);
  });
});

test('bash-only 条目独立成轮（水化分组语义，无用户消息前缀）', () => {
  const s = foldHydrate(initialThreadState, {
    kind: 'hydrate/reconcile',
    items: [history({ kind: 'bash', id: 'b1', command: 'ls', output: 'x', exitCode: 0 })],
    cursor: 1,
    dropLiveTurn: false,
  });
  expect(s.items.filter((item) => item.kind === 'turn').map((item) => (item.kind === 'turn' ? item.turn.id : ''))).toEqual(['turn-b1']);
});
