import { expect, test } from 'bun:test';

import { excludeHiddenProjects } from '../hidden-projects';
import type { SessionCardModel } from '../session-card-model';

function card(id: string, cwd: string): SessionCardModel {
  return { id, projectName: cwd.split('/').pop() ?? cwd, title: id, version: 'm', cwd, sessionPath: `/s/${id}.jsonl`, streaming: false, lastActivityAt: 0 };
}

test('空集合同引用返回（零重建）', () => {
  const sessions = [card('a', '/w/app')];
  expect(excludeHiddenProjects(sessions, new Set())).toBe(sessions);
});

test('隐藏 cwd 的会话被排除（置顶/分组/项目组三面共用同一过滤）', () => {
  const sessions = [card('a', '/w/app'), card('b', '/w/web'), card('c', '/w/app/sub')];
  expect(excludeHiddenProjects(sessions, new Set(['/w/app'])).map((s) => s.id)).toEqual(['b', 'c']);
});

test('多隐藏项目与无命中路径', () => {
  const sessions = [card('a', '/w/app'), card('b', '/w/web'), card('c', '/w/db')];
  expect(excludeHiddenProjects(sessions, new Set(['/w/app', '/w/db'])).map((s) => s.id)).toEqual(['b']);
  expect(excludeHiddenProjects(sessions, new Set(['/gone'])).map((s) => s.id)).toEqual(['a', 'b', 'c']);
});

test('空输入返回空数组', () => {
  expect(excludeHiddenProjects([], new Set(['/w/app']))).toEqual([]);
});
