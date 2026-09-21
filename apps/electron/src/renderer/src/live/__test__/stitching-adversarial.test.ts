import { describe, expect, test } from 'bun:test';
import type { UiEvent } from '@paiapp/contracts';

import { foldThreadEvent } from '../fold-events';
import { foldHydrate } from '../fold-hydrate';
import { initialThreadState, noteMessageTurn } from '../live-thread-state';
import type { LiveThreadState } from '../live-thread-state';
import type { HistoryItem } from '@paiapp/contracts';
import type { ThreadItem, TurnBlock } from '@/thread/thread-model';

/**
 * 消息拼接对抗（用户验收面）：文本/思考/工具三类流在同轮交错、孤儿事件（未见过
 * callId 的 update/end）、迟到 messageFinal、缺 tool 配对结算——折叠状态机不抛、
 * 不重复、不跨轮污染。全部断言在同步折叠后立即读取（无定时器/批延迟参与合并，
 * 同步直读即「立即可见」，兼作渲染路径无延迟合并的探针）。
 */

const T = 't1';
const NOW = 1_000;

const ev = (event: UiEvent, state: LiveThreadState, now = NOW): LiveThreadState => foldThreadEvent(state, event, now);

const liveTurnBlocks = (state: LiveThreadState): readonly TurnBlock[] => {
  const last = state.items.at(-1);
  if (last === undefined || last.kind !== 'turn') return [];
  return last.turn.blocks;
};

const liveTurn = (state: LiveThreadState) => {
  const last = state.items.at(-1);
  return last !== undefined && last.kind === 'turn' ? last.turn : null;
};

const blocksOf = (state: LiveThreadState, kinds: readonly TurnBlock['kind'][]): string =>
  liveTurnBlocks(state)
    .filter((block) => kinds.includes(block.kind))
    .map((block) => (block.kind === 'text' || block.kind === 'thinking' ? `${block.kind}:${block.text}` : `${block.kind}(${'calls' in block ? block.calls.length : 'diff' in block ? block.diff.changedFiles : 0})`))
    .join(' | ');

type ToolsBlock = Extract<TurnBlock, { kind: 'tools' }>;

const toolsBlock = (state: LiveThreadState) =>
  liveTurnBlocks(state).find((block): block is ToolsBlock => block.kind === 'tools');

describe('交错流拼接（同轮 text/thinking/tool 混合）', () => {
  test('思考→正文→工具→正文续→工具输出→权威替换：块序=到达序，内容精确无重复', () => {
    let s = initialThreadState;
    s = ev({ type: 'turnStarted', threadId: T, at: 1 }, s);
    s = ev({ type: 'messageStarted', threadId: T, messageId: 'm1', at: 2 }, s);
    s = ev({ type: 'thinkingDelta', threadId: T, messageId: 'm1', delta: '先想' }, s);
    s = ev({ type: 'thinkingDelta', threadId: T, messageId: 'm1', delta: '清楚' }, s);
    s = ev({ type: 'textDelta', threadId: T, messageId: 'm1', delta: '查一下' }, s);
    s = ev({ type: 'toolCallAdded', threadId: T, messageId: 'm1', call: { id: 'c1', name: 'grep', argsPreview: 'q' }, diff: null }, s);
    s = ev({ type: 'toolUpdated', threadId: T, callId: 'c1', output: '命中 3 行' }, s);
    s = ev({ type: 'textDelta', threadId: T, messageId: 'm1', delta: '，结论如下' }, s);
    s = ev({ type: 'toolEnded', threadId: T, callId: 'c1', output: '命中 3 行', isError: false, durationMs: 5, diff: null }, s);

    // 交错中途即正确（无 settle 也能读全）
    expect(blocksOf(s, ['text'])).toBe('text:查一下，结论如下');
    expect(blocksOf(s, ['thinking'])).toBe('thinking:先想清楚');
    expect(liveTurnBlocks(s).map((block) => block.kind)).toEqual(['thinking', 'text', 'tools']);
    expect(toolsBlock(s)?.calls[0]).toMatchObject({ id: 'c1', name: 'grep', output: '命中 3 行', status: 'ok' });

    // 权威替换：text/thinking 整体换为终值，不与流式叠加
    s = ev(
      {
        type: 'messageFinal',
        threadId: T,
        message: { id: 'm1', text: '查一下，结论如下（权威）', thinking: '先想清楚（权威）', toolCalls: [], usage: null },
      },
      s,
    );
    expect(blocksOf(s, ['text'])).toBe('text:查一下，结论如下（权威）');
    expect(blocksOf(s, ['thinking'])).toBe('thinking:先想清楚（权威）');
    expect(liveTurnBlocks(s).map((block) => block.kind)).toEqual(['thinking', 'text', 'tools']);

    s = ev({ type: 'turnSettled', threadId: T, ok: true, usage: null }, s);
    expect(s.streaming).toBe(false);
    expect(liveTurn(s)?.status).not.toBe('running');
  });

  test('同轮第二段消息（工具循环）：块按消息分段，互不串扰', () => {
    let s = initialThreadState;
    s = ev({ type: 'turnStarted', threadId: T, at: 1 }, s);
    s = ev({ type: 'messageStarted', threadId: T, messageId: 'm1', at: 2 }, s);
    s = ev({ type: 'textDelta', threadId: T, messageId: 'm1', delta: '第一段' }, s);
    s = ev({ type: 'messageFinal', threadId: T, message: { id: 'm1', text: '第一段', thinking: '', toolCalls: [], usage: null } }, s);
    // 第二段：新 messageStarted（工具循环后模型续写）
    s = ev({ type: 'messageStarted', threadId: T, messageId: 'm2', at: 3 }, s);
    s = ev({ type: 'thinkingDelta', threadId: T, messageId: 'm2', delta: '二段思考' }, s);
    s = ev({ type: 'textDelta', threadId: T, messageId: 'm2', delta: '第二段' }, s);
    expect(blocksOf(s, ['text'])).toBe('text:第一段 | text:第二段');
    expect(blocksOf(s, ['thinking'])).toBe('thinking:二段思考');
  });
});

describe('孤儿与缺配对（协议外形态客错）', () => {
  test('孤儿 toolUpdated（未见过 toolCallAdded）：no-op，不炸不建块', () => {
    let s = initialThreadState;
    s = ev({ type: 'turnStarted', threadId: T, at: 1 }, s);
    const before = s;
    s = ev({ type: 'toolUpdated', threadId: T, callId: 'ghost', output: 'x' }, s);
    expect(s).toBe(before);
  });

  test('孤儿 toolEnded（含 diff）：不炸；重复 ended 幂等（末次输出生效，不叠加）', () => {
    let s = initialThreadState;
    s = ev({ type: 'turnStarted', threadId: T, at: 1 }, s);
    s = ev({ type: 'messageStarted', threadId: T, messageId: 'm1', at: 2 }, s);
    s = ev({ type: 'toolCallAdded', threadId: T, messageId: 'm1', call: { id: 'c1', name: 'edit', argsPreview: 'f.ts' }, diff: [{ path: 'f.ts', additions: 2, deletions: 1 }] }, s);
    s = ev({ type: 'toolEnded', threadId: T, callId: 'c1', output: 'done', isError: false, durationMs: 3, diff: [{ path: 'f.ts', additions: 2, deletions: 1 }] }, s);
    s = ev({ type: 'toolEnded', threadId: T, callId: 'c1', output: 'done', isError: false, durationMs: 3, diff: null }, s);
    expect(toolsBlock(s)?.calls[0]).toMatchObject({ id: 'c1', output: 'done', status: 'ok' });
    const diffBlocks = liveTurnBlocks(s).filter((block) => block.kind === 'diff');
    expect(diffBlocks.length).toBe(1);
  });

  test('缺 toolEnded 直接 settle：running 工具冻结为非运行轮的一部分，不抛不残留 streaming', () => {
    let s = initialThreadState;
    s = ev({ type: 'turnStarted', threadId: T, at: 1 }, s);
    s = ev({ type: 'messageStarted', threadId: T, messageId: 'm1', at: 2 }, s);
    s = ev({ type: 'toolCallAdded', threadId: T, messageId: 'm1', call: { id: 'c1', name: 'bash', argsPreview: 'sleep' }, diff: null }, s);
    s = ev({ type: 'turnSettled', threadId: T, ok: true, usage: null }, s);
    expect(s.streaming).toBe(false);
    const turn = liveTurn(s);
    expect(turn?.status).not.toBe('running');
    // 结算把流式中断残留的 running 调用定格为 stopped（不再走表），不抛不残留
    const tools = turn?.blocks.find((block): block is Extract<TurnBlock, { kind: 'tools' }> => block.kind === 'tools');
    expect(tools?.calls[0]?.status).toBe('stopped');
  });

  test('迟到 messageFinal（跨轮，协议序外形态）：不污染新轮正文', () => {
    let s = initialThreadState;
    s = ev({ type: 'turnStarted', threadId: T, at: 1 }, s);
    s = ev({ type: 'messageStarted', threadId: T, messageId: 'm1', at: 2 }, s);
    s = ev({ type: 'textDelta', threadId: T, messageId: 'm1', delta: '旧轮' }, s);
    s = ev({ type: 'turnSettled', threadId: T, ok: true, usage: null }, s);
    const settledItems: readonly ThreadItem[] = s.items;
    // 新轮开启
    s = ev({ type: 'turnStarted', threadId: T, at: 3 }, s);
    s = ev({ type: 'messageStarted', threadId: T, messageId: 'm2', at: 4 }, s);
    s = ev({ type: 'textDelta', threadId: T, messageId: 'm2', delta: '新轮' }, s);
    // 旧轮的权威消息此刻才到（错序/重放形态）
    s = ev({ type: 'messageFinal', threadId: T, message: { id: 'm1', text: '旧轮（权威）', thinking: '', toolCalls: [], usage: null } }, s);
    // 新轮正文不受污染
    expect(blocksOf(s, ['text'])).toBe('text:新轮');
    void settledItems;
  });
});

describe('同步折叠性能探针（无定时器/批延迟参与合并）', () => {
  test('万级混合事件同步折叠：预算内完成；非条目事件不重建 items（memo 事实基础）', () => {
    let s = initialThreadState;
    s = ev({ type: 'turnStarted', threadId: T, at: 1 }, s);
    s = ev({ type: 'messageStarted', threadId: T, messageId: 'm0', at: 2 }, s);
    s = ev({ type: 'textDelta', threadId: T, messageId: 'm0', delta: '正文' }, s);

    const started = performance.now();
    for (let i = 0; i < 10_000; i += 1) {
      s = ev({ type: 'textDelta', threadId: T, messageId: 'm0', delta: 'x' }, s);
      if (i % 100 === 0) s = ev({ type: 'thinkingDelta', threadId: T, messageId: 'm0', delta: 'y' }, s);
    }
    const elapsed = performance.now() - started;
    // 纯同步折叠：万级 delta 在宽预算内（当前机器实测远低于此值，防 CI 抖动）
    expect(elapsed).toBeLessThan(1_000);
    // 同步直读即终值（无任何延迟批/定时器参与合并）
    const live = liveTurn(s);
    const text = live?.blocks.find((block): block is Extract<TurnBlock, { kind: 'text' }> => block.kind === 'text');
    expect(text?.text.endsWith('x')).toBe(true);
    // 非条目事件（queueChanged）返回的 items 引用稳定——排队镜像刷新不触发消息列表重渲
    const itemsRef = s.items;
    s = ev({ type: 'queueChanged', threadId: T, steering: [], followUp: ['q'] }, s);
    expect(s.items).toBe(itemsRef);
    // 孤儿 toolUpdated 同样不重建 items（真 no-op）
    const before = s.items;
    s = ev({ type: 'toolUpdated', threadId: T, callId: 'ghost', output: 'x' }, s);
    expect(s.items).toBe(before);
  });

  test('下一条 messageStarted 清上一条的流式思考指针：思考块保留、指针归位', () => {
    let s = initialThreadState;
    s = ev({ type: 'turnStarted', threadId: T, at: 1 }, s);
    s = ev({ type: 'messageStarted', threadId: T, messageId: 'm1', at: 2 }, s);
    s = ev({ type: 'thinkingDelta', threadId: T, messageId: 'm1', delta: '先想' }, s);
    expect(liveTurn(s)?.streamingThinkingBlockId).not.toBeNull();
    // 同轮第二段消息开流：上一段的思考流指针被清（后续 thinkingDelta 落到新块）
    s = ev({ type: 'messageStarted', threadId: T, messageId: 'm2', at: 3 }, s);
    expect(liveTurn(s)?.streamingThinkingBlockId).toBeNull();
    expect(blocksOf(s, ['thinking'])).toBe('thinking:先想');
    // 归属登记：两条消息都指向当前轮（迟到 final 守卫的事实基础）
    expect(s.messageTurns['m1']).toBe(liveTurn(s)?.id);
    expect(s.messageTurns['m2']).toBe(liveTurn(s)?.id);
  });
});

/** rebuild 载荷最小形状（真源 get_entries → entries-mapper 的 items）。 */
function rebuildItems(): HistoryItem[] {
  return [
    { kind: 'user', id: 'seq-1', text: '分析一下', origin: 'user', at: 1, images: [] },
    { kind: 'assistant', id: 'seq-2', at: 2, messageTs: 2, text: '旧轮权威正文', thinking: '', toolCalls: [], usage: null, stopReason: null, errorMessage: null },
  ] as unknown as HistoryItem[];
}

describe('迟到 messageFinal 跨轮守卫的三个边界（对抗审查 F1/F2 回归）', () => {
  test('F1：settle→rebuild→新轮后，旧轮迟到 final 不得以 owner undefined 直通污染新轮', () => {
    let s = initialThreadState;
    s = ev({ type: 'turnStarted', threadId: T, at: 100 }, s);
    s = ev({ type: 'messageStarted', threadId: T, messageId: 'stream-1', at: 101 }, s);
    s = ev({ type: 'textDelta', threadId: T, messageId: 'stream-1', delta: '旧轮流式' }, s);
    s = ev({ type: 'turnSettled', threadId: T, ok: true, usage: null }, s);
    // settle 后 rebuild（live-controller 的对账路径）；归属表不随重建清空
    s = foldHydrate(s, { kind: 'hydrate/rebuild', items: rebuildItems(), cursor: 2 });
    s = ev({ type: 'turnStarted', threadId: T, at: 200 }, s);
    s = ev({ type: 'messageStarted', threadId: T, messageId: 'stream-2', at: 201 }, s);
    s = ev({ type: 'textDelta', threadId: T, messageId: 'stream-2', delta: '新轮正文' }, s);
    // 旧轮权威此刻迟到（错序/重放形态）
    s = ev({ type: 'messageFinal', threadId: T, message: { id: 'stream-1', text: '旧轮权威', thinking: '', toolCalls: [], usage: null } }, s);
    expect(blocksOf(s, ['text'])).toBe('text:新轮正文'); // 修复前：混入 text:旧轮权威
  });

  test('F2：同毫秒连开两轮（失败重试零条目增长），旧轮迟到 final 因轮 id 单调唯一被拦', () => {
    let s = initialThreadState;
    s = ev({ type: 'turnStarted', threadId: T, at: 5000 }, s);
    s = ev({ type: 'messageStarted', threadId: T, messageId: 'stream-1', at: 5001 }, s);
    s = ev({ type: 'textDelta', threadId: T, messageId: 'stream-1', delta: '轮1' }, s);
    s = ev({ type: 'turnSettled', threadId: T, ok: false, usage: null }, s);
    s = ev({ type: 'turnStarted', threadId: T, at: 5000 }, s); // 同毫秒：旧实现 id 按 (时间戳,长度) 复用
    s = ev({ type: 'messageStarted', threadId: T, messageId: 'stream-2', at: 5002 }, s);
    s = ev({ type: 'textDelta', threadId: T, messageId: 'stream-2', delta: '轮2' }, s);
    s = ev({ type: 'messageFinal', threadId: T, message: { id: 'stream-1', text: '轮1权威', thinking: '', toolCalls: [], usage: null } }, s);
    expect(blocksOf(s, ['text'])).toBe('text:轮2'); // 修复前：owner===liveTurnId 误放行
    // 轮 id 单调唯一的事实：两轮 id 不同
    const ids = s.items.filter((item) => item.kind === 'turn').map((item) => (item as { kind: 'turn'; turn: { id: string } }).turn.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('消息归属表封顶（长会话防泄漏）', () => {
  test('noteMessageTurn 超 1024 条保留最新一半，新写入恒在表', () => {
    const table: Record<string, string> = {};
    for (let i = 0; i < 1_024; i += 1) table[`m${i}`] = 'turn-a';
    const merged = noteMessageTurn(table, 'm-new', 'turn-b');
    expect(merged['m-new']).toBe('turn-b');
    expect(merged['m0']).toBeUndefined();
    expect(merged['m1023']).toBe('turn-a');
    expect(Object.keys(merged).length).toBe(512);
  });
});
