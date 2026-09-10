import { expect, test } from 'bun:test';

import { buildPinnedList } from '../build-pinned-list';
import type { SessionCardModel } from '../session-card-model';

function card(
  id: string,
  projectName: string,
  sessionPath: string | null,
  lastActivityAt: number,
): SessionCardModel {
  return { id, projectName, title: id, version: 'm', cwd: `/w/${projectName}`, sessionPath, state: 'live', streaming: false, lastActivityAt };
}

test('置顶交集：仅 sessionPath 命中置顶集合的会话进入', () => {
  const sessions = [
    card('a', 'app', '/s/a.jsonl', 30),
    card('b', 'app', '/s/b.jsonl', 20),
    card('c', 'web', '/s/c.jsonl', 10),
  ];
  const pinned = new Set(['/s/a.jsonl', '/s/c.jsonl']);
  expect(buildPinnedList(sessions, pinned).map((s) => s.id)).toEqual(['a', 'c']);
});

test('置顶区按最近活跃倒序（输入乱序不构成前提）', () => {
  const sessions = [
    card('old', 'app', '/s/old.jsonl', 10),
    card('new', 'app', '/s/new.jsonl', 99),
    card('mid', 'web', '/s/mid.jsonl', 50),
  ];
  const pinned = new Set(['/s/old.jsonl', '/s/new.jsonl', '/s/mid.jsonl']);
  expect(buildPinnedList(sessions, pinned).map((s) => s.id)).toEqual(['new', 'mid', 'old']);
});

test('未落盘会话（sessionPath null）无置顶键，不入置顶区', () => {
  const sessions = [card('fresh', 'app', null, 99)];
  expect(buildPinnedList(sessions, new Set())).toEqual([]);
});

test('空置顶集合返回空数组', () => {
  const sessions = [card('a', 'app', '/s/a.jsonl', 10)];
  expect(buildPinnedList(sessions, new Set())).toEqual([]);
});

test('置顶集合含已关闭会话路径时：live 列表无此会话即不出现', () => {
  const sessions = [card('a', 'app', '/s/a.jsonl', 10)];
  expect(buildPinnedList(sessions, new Set(['/s/gone.jsonl'])).map((s) => s.id)).toEqual([]);
});

test('空输入返回空数组', () => {
  expect(buildPinnedList([], new Set(['/s/a.jsonl']))).toEqual([]);
});
