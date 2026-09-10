import { expect, test } from 'bun:test';

import { buildProjectGroups, SHOW_MORE_LIMIT } from '../build-project-groups';
import type { SessionCardModel } from '../session-card-model';

function card(id: string, projectName: string, lastActivityAt: number): SessionCardModel {
  return { id, projectName, title: id, version: 'm', cwd: `/w/${projectName}`, sessionPath: `/s/${id}.jsonl`, state: 'live', streaming: false, lastActivityAt };
}

test('按 cwd 分组，组内最近活跃倒序', () => {
  const sessions = [
    card('a2', 'app', 20),
    card('w1', 'web', 30),
    card('a1', 'app', 10),
  ];
  const groups = buildProjectGroups(sessions, new Set(), new Set());
  // web 组最近活跃(30) > app 组(20)，组间 web 在前
  expect(groups.map((g) => g.projectName)).toEqual(['web', 'app']);
  expect(groups[0].visible.map((s) => s.id)).toEqual(['w1']);
  expect(groups[1].visible.map((s) => s.id)).toEqual(['a2', 'a1']);
});

test('症状回归（T17 测试轮）：同名异目录项目不并组（键 = cwd，显示名 = basename）', () => {
  const sessions: readonly SessionCardModel[] = [
    { ...card('a1', 'app', 10), cwd: '/a/app' },
    { ...card('b1', 'app', 20), cwd: '/b/app' },
  ];
  const groups = buildProjectGroups(sessions, new Set(), new Set());
  expect(groups).toHaveLength(2);
  expect(groups.map((g) => g.key)).toEqual(['/b/app', '/a/app']);
  expect(groups.every((g) => g.projectName === 'app')).toBe(true);
});

test('组内条数不超 limit 时全量可见、无折叠', () => {
  const sessions = [card('a', 'app', 1), card('b', 'app', 2)];
  const [group] = buildProjectGroups(sessions, new Set(), new Set());
  expect(group.total).toBe(2);
  expect(group.visible).toHaveLength(2);
  expect(group.expanded).toBe(false);
});

test('组内超 limit 且未展开时截断为前 limit 条', () => {
  const sessions = Array.from({ length: SHOW_MORE_LIMIT + 3 }, (_, i) => card(`s${i}`, 'app', i));
  const [group] = buildProjectGroups(sessions, new Set(), new Set());
  expect(group.total).toBe(SHOW_MORE_LIMIT + 3);
  expect(group.visible).toHaveLength(SHOW_MORE_LIMIT);
  // 截断保留的是最近活跃的前 limit 条
  expect(group.visible.map((s) => s.id)).toEqual(['s7', 's6', 's5', 's4', 's3']);
});

test('expanded 集合命中（键 = cwd）的组全量可见', () => {
  const sessions = Array.from({ length: SHOW_MORE_LIMIT + 2 }, (_, i) => card(`s${i}`, 'app', i));
  const [group] = buildProjectGroups(sessions, new Set(), new Set(['/w/app']));
  expect(group.expanded).toBe(true);
  expect(group.visible).toHaveLength(SHOW_MORE_LIMIT + 2);
});

test('置顶会话从项目分组排除（置顶项只在置顶区出现一次）', () => {
  const sessions = [
    card('pinned', 'app', 99),
    card('plain', 'app', 10),
  ];
  const groups = buildProjectGroups(sessions, new Set(['/s/pinned.jsonl']), new Set());
  expect(groups).toHaveLength(1);
  expect(groups[0].visible.map((s) => s.id)).toEqual(['plain']);
});

test('置顶排除后空组不出现', () => {
  const sessions = [card('only', 'app', 99)];
  const groups = buildProjectGroups(sessions, new Set(['/s/only.jsonl']), new Set());
  expect(groups).toEqual([]);
});

test('自定义 limit 生效（0 边界：全部折叠不可见但 total 保留）', () => {
  const sessions = [card('a', 'app', 1), card('b', 'app', 2)];
  const [group] = buildProjectGroups(sessions, new Set(), new Set(), 0);
  expect(group.visible).toHaveLength(0);
  expect(group.total).toBe(2);
});

test('负数 limit 钳制为 0（不得静默去掉末尾条目）', () => {
  const sessions = [card('a', 'app', 1), card('b', 'app', 2)];
  const [group] = buildProjectGroups(sessions, new Set(), new Set(), -1);
  expect(group.visible).toHaveLength(0);
  expect(group.total).toBe(2);
});

test('组间按各组最近活跃倒序（输入顺序不构成前提）', () => {
  // web 组最近一条(100)比 app 组最近一条(50)新，组间 web 在前
  const sessions = [
    card('app-old', 'app', 10),
    card('web-new', 'web', 100),
    card('app-new', 'app', 50),
  ];
  const groups = buildProjectGroups(sessions, new Set(), new Set());
  expect(groups.map((g) => g.projectName)).toEqual(['web', 'app']);
});

test('空输入返回空数组', () => {
  expect(buildProjectGroups([], new Set(), new Set())).toEqual([]);
});
