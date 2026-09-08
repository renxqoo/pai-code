import { expect, test } from 'bun:test';

import { expandGroup, toggleGroupFold, type GroupFold } from '../group-collapse';

function fold(collapsed: readonly string[] = [], expanded: readonly string[] = []): GroupFold {
  return { collapsed: new Set(collapsed), expanded: new Set(expanded) };
}

test('toggle：未折叠键加入折叠集合，已折叠键移除', () => {
  const closed = toggleGroupFold(fold(), 'app');
  expect([...closed.collapsed]).toEqual(['app']);
  const reopened = toggleGroupFold(closed, 'app');
  expect(reopened.collapsed.size).toBe(0);
});

test('症状回归（T17 对抗审查 P1）：折叠已展开「显示更多」的组时同步清展开态，再展开回到截断视图', () => {
  const withMore = expandGroup(fold(), 'app');
  expect(withMore.expanded.has('app')).toBe(true);
  const collapsed = toggleGroupFold(withMore, 'app');
  expect(collapsed.collapsed.has('app')).toBe(true);
  expect(collapsed.expanded.has('app')).toBe(false);
  const reopened = toggleGroupFold(collapsed, 'app');
  expect(reopened.collapsed.has('app')).toBe(false);
  expect(reopened.expanded.has('app')).toBe(false);
});

test('toggle 切回展开不动显示更多态（其他组不受折叠联动影响）', () => {
  const reopened = toggleGroupFold(fold(['app'], ['app', 'web']), 'app');
  expect(reopened.collapsed.size).toBe(0);
  expect([...reopened.expanded].sort()).toEqual(['app', 'web']);
});

test('toggle 返回新集合，输入不动', () => {
  const input = fold(['app']);
  const output = toggleGroupFold(input, 'web');
  expect([...input.collapsed]).toEqual(['app']);
  expect([...output.collapsed].sort()).toEqual(['app', 'web']);
});

test('expandGroup：新键加入，已展开返回原引用（幂等）', () => {
  const base = fold();
  const first = expandGroup(base, 'app');
  expect([...first.expanded]).toEqual(['app']);
  expect(expandGroup(first, 'app')).toBe(first);
});

test('expandGroup 不触碰折叠集合', () => {
  const base = fold(['app']);
  const next = expandGroup(base, 'web');
  expect([...next.collapsed]).toEqual(['app']);
  expect([...next.expanded]).toEqual(['web']);
});
