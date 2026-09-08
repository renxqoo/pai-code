import { expect, test } from 'bun:test';

import { filterSessions } from '../filter-sessions';
import type { SessionCardModel } from '../session-card-model';

function card(id: string, title: string, projectName: string): SessionCardModel {
  return { id, conversationId: id, projectName, title, version: 'm', lastActivityAt: 0 };
}

const sessions = [
  card('a', 'Fix login bug', 'web-app'),
  card('b', '优化构建速度', 'infra'),
  card('c', 'Write docs', 'web-app'),
];

test('空查询原样返回（同引用，不重建列表）', () => {
  expect(filterSessions(sessions, '')).toBe(sessions);
});

test('空白串等价空查询', () => {
  expect(filterSessions(sessions, '   \t ')).toBe(sessions);
});

test('标题大小写不敏感子串命中', () => {
  expect(filterSessions(sessions, 'login').map((s) => s.id)).toEqual(['a']);
  expect(filterSessions(sessions, 'FIX').map((s) => s.id)).toEqual(['a']);
});

test('项目名命中（同项目多会话都保留）', () => {
  expect(filterSessions(sessions, 'web').map((s) => s.id)).toEqual(['a', 'c']);
});

test('中文标题命中', () => {
  expect(filterSessions(sessions, '构建').map((s) => s.id)).toEqual(['b']);
});

test('无命中返回空数组', () => {
  expect(filterSessions(sessions, 'zzz')).toEqual([]);
});

test('命中为子串而非前缀', () => {
  expect(filterSessions(sessions, 'docs').map((s) => s.id)).toEqual(['c']);
});

test('空标题会话不崩溃（空字符串恒不包含非空查询）', () => {
  const only = [card('x', '', 'p')];
  expect(filterSessions(only, 'x')).toEqual([]);
  expect(filterSessions(only, 'p').map((s) => s.id)).toEqual(['x']);
});
