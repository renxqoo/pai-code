import { describe, expect, test } from 'bun:test';

import { hydrateItems, hydrateNewItems, mergeDiffFile } from '../hydrate-items';
import type { HistoryItem } from '@paiapp/contracts';

const at = (n: number): number => 1_000 + n;

function user(id: string, text: string, origin: 'user' | 'system' = 'user'): HistoryItem {
  return { kind: 'user', id, text, origin, images: [], at: at(1) };
}

function assistant(id: string, patch: Partial<Extract<HistoryItem, { kind: 'assistant' }>> = {}): HistoryItem {
  return { kind: 'assistant', id, text: '', thinking: '', toolCalls: [], usage: null, stopReason: null, errorMessage: null, at: at(2), ...patch };
}

function bash(id: string, command: string): HistoryItem {
  return { kind: 'bash', id, command, output: '', exitCode: 0, cancelled: false, at: at(3) };
}

describe('hydrateItems · 分组语义', () => {
  test('多段 assistant 折叠为一个轮次：thinking/text/tools 顺序与多消息块 id 后缀', () => {
    const items = hydrateItems([
      user('u1', '问'),
      assistant('a1', { thinking: '想', text: '先查' }),
      assistant('a2', { text: '结论' }),
      assistant('a3', {
        text: '写文件',
        toolCalls: [{ id: 'c1', name: 'write', argsPreview: 'x.ts', output: 'ok', isError: false, diff: [{ path: 'x.ts', additions: 3, deletions: 0 }] }],
      }),
    ]);
    expect(items.length).toBe(2);
    const turn = items[1];
    if (turn?.kind !== 'turn') throw new Error('expected turn');
    expect(turn.turn.id).toBe('turn-a1');
    expect(turn.turn.blocks.map((block) => block.kind)).toEqual(['thinking', 'text', 'text', 'text', 'tools', 'diff']);
    // 第二段 text 块 id 带序号后缀（同 id 防撞）
    const texts = turn.turn.blocks.filter((block) => block.kind === 'text');
    expect(texts.map((block) => (block.kind === 'text' ? block.id : ''))).toEqual(['text-a1', 'text-a2', 'text-a3']);
    const diff = turn.turn.blocks.find((block) => block.kind === 'diff');
    expect(diff).toMatchObject({ diff: { changedFiles: 1, additions: 3, deletions: 0 } });
  });

  test('bash 条目独立成单工具轮次（exitCode 非零 → failed）', () => {
    const items = hydrateItems([user('u1', '跑'), { kind: 'bash', id: 'b1', command: 'npm t', output: 'err', exitCode: 1, cancelled: false, at: at(4) }]);
    const turn = items[1];
    if (turn?.kind !== 'turn') throw new Error('expected turn');
    expect(turn.turn.id).toBe('turn-b1');
    const tools = turn.turn.blocks[0];
    expect(tools).toMatchObject({ kind: 'tools', calls: [{ name: 'bash', argsPreview: 'npm t', exitCode: 1, status: 'failed' }] });
  });

  test('全空且正常结束的 assistant 组不产生空轮次', () => {
    const items = hydrateItems([user('u1', 'x'), assistant('a1'), assistant('a2')]);
    expect(items.length).toBe(1);
  });

  test('症状回归：error/aborted 的空 assistant 不再整轮消失——产生带 turnFailure 提示的轮次', () => {
    const errored = hydrateItems([user('u1', '图片有什么'), assistant('a1', { stopReason: 'error', errorMessage: '401 {"type":"error"}' })]);
    expect(errored.length).toBe(2);
    const errorTurn = errored[1];
    if (errorTurn?.kind !== 'turn') throw new Error('expected turn');
    expect(errorTurn.turn.blocks).toEqual([{ kind: 'turnFailure', id: 'fail-a1', stopReason: 'error', message: '401 {"type":"error"}' }]);
    expect(errorTurn.turn.status).toBe('completed');

    const aborted = hydrateItems([user('u1', 'x'), assistant('a2', { stopReason: 'aborted' })]);
    const abortTurn = aborted[1];
    if (abortTurn?.kind !== 'turn') throw new Error('expected turn');
    expect(abortTurn.turn.blocks).toEqual([{ kind: 'turnFailure', id: 'fail-a2', stopReason: 'aborted', message: null }]);
    expect(abortTurn.turn.status).toBe('stopped');
  });

  test('有正文的轮次末异常也追加提示块；组内取最后一个 assistant 的终态', () => {
    const items = hydrateItems([
      user('u1', '问'),
      assistant('a1', { text: '部分回答' }),
      assistant('a2', { text: '续写被截断', stopReason: 'aborted' }),
    ]);
    const turn = items[1];
    if (turn?.kind !== 'turn') throw new Error('expected turn');
    expect(turn.turn.blocks[turn.turn.blocks.length - 1]).toMatchObject({ kind: 'turnFailure', stopReason: 'aborted' });
    expect(turn.turn.status).toBe('stopped');
    // 中间条目带异常终态但组以正常条目收尾 → 无提示块
    const normal = hydrateItems([assistant('a3', { text: '先错', stopReason: 'error' }), assistant('a4', { text: '后成功' })]);
    const normalTurn = normal[0];
    if (normalTurn?.kind !== 'turn') throw new Error('expected turn');
    expect(normalTurn.turn.blocks.some((block) => block.kind === 'turnFailure')).toBe(false);
  });

  test('系统信封 user 渲染为 system 角色', () => {
    const items = hydrateItems([user('n1', '[task-notification] done', 'system')]);
    expect(items[0]).toMatchObject({ kind: 'message', message: { role: 'system' } });
  });

  test('无 assistant 的纯 user 历史不产生轮次', () => {
    const items = hydrateItems([user('u1', 'a'), user('u2', 'b')]);
    expect(items.length).toBe(2);
  });
});

describe('hydrateNewItems · 对账增量', () => {
  test('条目组保留 entryIds 供去重；user/bash 单条目；assistant 组聚合', () => {
    const groups = hydrateNewItems([
      user('u1', '问'),
      assistant('a1', { text: '一' }),
      assistant('a2', { text: '二' }),
      bash('b1', 'ls'),
    ]);
    expect(groups.map((group) => group.item.kind)).toEqual(['message', 'turn', 'turn']);
    expect(groups[0]?.entryIds).toEqual(['u1']);
    expect(groups[1]?.entryIds).toEqual(['a1', 'a2']);
    expect(groups[2]?.entryIds).toEqual(['b1']);
  });

  test('空输入与全中止组不产生条目', () => {
    expect(hydrateNewItems([])).toEqual([]);
    const groups = hydrateNewItems([assistant('a1'), assistant('a2')]);
    // 全空组：hydrateItems 产出空 → 不入列
    expect(groups.length).toBe(0);
  });
});

describe('hydrateItems · 轮次计时锚定', () => {
  test('症状回归：单 assistant 轮计时坍缩为 0s——startedAt 锚定触发 user 条目时刻而非首条 assistant', () => {
    const items = hydrateItems([
      { ...user('u1', '你好'), at: 1_000 },
      { ...assistant('a1', { text: '你好！' }), at: 4_200 },
    ]);
    const turn = items[1];
    if (turn?.kind !== 'turn') throw new Error('expected turn');
    expect(turn.turn.startedAt).toBe(1_000);
    expect(turn.turn.endedAt).toBe(4_200);
    expect(turn.turn.endedAt - turn.turn.startedAt).toBeGreaterThan(0);
  });

  test('多轮各锚自己的触发消息，不沿用上一轮锚点', () => {
    const items = hydrateItems([
      { ...user('u1', '一'), at: 1_000 },
      { ...assistant('a1', { text: '答一' }), at: 2_000 },
      { ...user('u2', '二'), at: 5_000 },
      { ...assistant('a2', { text: '答二' }), at: 7_500 },
    ]);
    const first = items[1];
    const second = items[3];
    if (first?.kind !== 'turn' || second?.kind !== 'turn') throw new Error('expected turns');
    expect(first.turn.startedAt).toBe(1_000);
    expect(second.turn.startedAt).toBe(5_000);
  });

  test('无前置 user 条目的组回退首条 assistant 时刻', () => {
    const items = hydrateItems([{ ...assistant('a1', { text: '孤儿轮' }), at: 7_000 }]);
    const turn = items[0];
    if (turn?.kind !== 'turn') throw new Error('expected turn');
    expect(turn.turn.startedAt).toBe(7_000);
  });

  test('锚点即用即弃：bash 隔断后的组不沿用更早的 user 时刻（避免夸大时长）', () => {
    const items = hydrateItems([
      { ...user('u1', '跑'), at: 1_000 },
      { ...assistant('a1', { text: '先答' }), at: 2_000 },
      { ...bash('b1', 'ls'), at: 3_000 },
      { ...assistant('a2', { text: '后答' }), at: 9_000 },
    ]);
    const second = items[3];
    if (second?.kind !== 'turn') throw new Error('expected turn');
    expect(second.turn.startedAt).toBe(9_000);
  });
});

describe('hydrateNewItems · 对账计时锚定', () => {
  test('症状回归：对账重建的 assistant 组锚定前置 user 条目时刻', () => {
    const groups = hydrateNewItems([
      { ...user('u1', '你好'), at: 1_000 },
      { ...assistant('a1', { text: '你好！' }), at: 4_200 },
    ]);
    const turn = groups[1]?.item;
    if (turn?.kind !== 'turn') throw new Error('expected turn');
    expect(turn.turn.startedAt).toBe(1_000);
    expect(turn.turn.endedAt).toBe(4_200);
  });

  test('bash 清空锚点：其后无 user 前置的组回退首条 assistant 时刻', () => {
    const groups = hydrateNewItems([
      { ...user('u1', '跑'), at: 1_000 },
      { ...bash('b1', 'ls'), at: 2_000 },
      { ...assistant('a1', { text: '答' }), at: 6_000 },
    ]);
    const turn = groups[2]?.item;
    if (turn?.kind !== 'turn') throw new Error('expected turn');
    expect(turn.turn.startedAt).toBe(6_000);
  });
});

describe('mergeDiffFile', () => {
  test('新路径追加；同路径替换计数', () => {
    const files: Array<{ path: string; additions: number; deletions: number }> = [];
    mergeDiffFile(files, 'a.ts', 1, 2);
    mergeDiffFile(files, 'b.ts', 5, 0);
    mergeDiffFile(files, 'a.ts', 3, 4);
    expect(files).toEqual([
      { path: 'a.ts', additions: 3, deletions: 4 },
      { path: 'b.ts', additions: 5, deletions: 0 },
    ]);
  });
});
