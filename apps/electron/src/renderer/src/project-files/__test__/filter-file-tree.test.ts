import { expect, test } from 'bun:test';

import { buildFileTree } from '@/sidebar/build-file-tree';
import { filterFileTree } from '../filter-file-tree';

const tree = buildFileTree(['src/index.ts', 'src/lib/util.ts', 'docs/guide.md', 'README.md']);

test('空查询原样返回（同引用）', () => {
  expect(filterFileTree(tree, '')).toBe(tree);
  expect(filterFileTree(tree, '   ')).toBe(tree);
});

test('文件名子串命中：保留祖先目录链', () => {
  const filtered = filterFileTree(tree, 'util');
  expect(filtered.map((node) => node.name)).toEqual(['src']);
  expect(filtered[0]?.children.map((node) => node.name)).toEqual(['lib']);
  expect(filtered[0]?.children[0]?.children.map((node) => node.name)).toEqual(['util.ts']);
});

test('目录名命中：整棵子树保留', () => {
  const filtered = filterFileTree(tree, 'docs');
  expect(filtered.map((node) => node.name)).toEqual(['docs']);
  expect(filtered[0]?.children).toHaveLength(1);
});

test('路径深层子串命中（大小写不敏感）', () => {
  const filtered = filterFileTree(tree, 'SRC/LIB');
  expect(filtered[0]?.children[0]?.name).toBe('lib');
});

test('无命中返回空数组', () => {
  expect(filterFileTree(tree, 'zzz')).toEqual([]);
});
