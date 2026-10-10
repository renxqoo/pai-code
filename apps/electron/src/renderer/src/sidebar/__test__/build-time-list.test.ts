import { expect, test } from 'bun:test';

import { buildTimeList } from '../build-time-list';
import type { SessionCardModel } from '../session-card-model';

function card(id: string, sessionPath: string | null, lastActivityAt: number, createdAt: number = lastActivityAt): SessionCardModel {
  return { id, projectName: 'app', title: id, version: 'm', cwd: '/w/app', sessionPath, state: 'live', streaming: false, lastActivityAt, createdAt };
}

test('排除置顶会话后按创建时间倒序（活动时间不参与排序）', () => {
  const sessions = [
    card('pinned', '/s/p.jsonl', 99),
    card('old', '/s/o.jsonl', 10, 10),
    card('new', '/s/n.jsonl', 5, 50),
  ];
  const pinned = new Set(['/s/p.jsonl']);
  expect(buildTimeList(sessions, pinned).map((s) => s.id)).toEqual(['new', 'old']);
});

test('置顶集合为空时全量保留（仍按倒序）', () => {
  const sessions = [card('a', '/s/a.jsonl', 10), card('b', '/s/b.jsonl', 20)];
  expect(buildTimeList(sessions, new Set()).map((s) => s.id)).toEqual(['b', 'a']);
});

test('未落盘会话（sessionPath null）不参与置顶排除，照常出现', () => {
  const sessions = [card('fresh', null, 5), card('done', '/s/d.jsonl', 10)];
  expect(buildTimeList(sessions, new Set(['/s/d.jsonl'])).map((s) => s.id)).toEqual(['fresh']);
});

test('置顶集合含不存在路径时不影响结果', () => {
  const sessions = [card('a', '/s/a.jsonl', 1)];
  expect(buildTimeList(sessions, new Set(['/s/gone.jsonl'])).map((s) => s.id)).toEqual(['a']);
});

test('空输入返回空数组', () => {
  expect(buildTimeList([], new Set())).toEqual([]);
});
