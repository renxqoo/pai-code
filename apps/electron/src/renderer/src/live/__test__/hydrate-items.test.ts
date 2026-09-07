import { describe, expect, test } from 'bun:test';

import { hydrateItems, hydrateNewItems, mergeDiffFile } from '../hydrate-items';
import type { HistoryItem } from '@paiapp/contracts';

const at = (n: number): number => 1_000 + n;

function user(id: string, text: string, origin: 'user' | 'system' = 'user'): HistoryItem {
  return { kind: 'user', id, text, origin, at: at(1) };
}

function assistant(id: string, patch: Partial<Extract<HistoryItem, { kind: 'assistant' }>> = {}): HistoryItem {
  return { kind: 'assistant', id, text: '', thinking: '', toolCalls: [], usage: null, at: at(2), ...patch };
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
    expect(texts.map((block) => (block.kind === 'text' ? block.id : ''))).toEqual(['text-a1', 'text-a2-1', 'text-a3-2']);
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

  test('全空中止 assistant 组不产生空轮次', () => {
    const items = hydrateItems([user('u1', 'x'), assistant('a1'), assistant('a2')]);
    expect(items.length).toBe(1);
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
