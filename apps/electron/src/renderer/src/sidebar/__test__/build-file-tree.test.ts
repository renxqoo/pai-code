import { expect, test } from 'bun:test';

import { buildFileTree } from '../build-file-tree';

function names(nodes: readonly { name: string }[]): string[] {
  return nodes.map((node) => node.name);
}

test('嵌套路径聚合成树（目录节点由路径推导）', () => {
  const tree = buildFileTree(['src/index.ts', 'src/lib/util.ts', 'README.md']);
  expect(names(tree)).toEqual(['src', 'README.md']);
  const src = tree[0];
  expect(src?.kind).toBe('dir');
  expect(names(src?.children ?? [])).toEqual(['lib', 'index.ts']);
  expect(src?.children[0]?.path).toBe('src/lib');
  expect(src?.children[1]?.kind).toBe('file');
});

test('同级排序：目录在前、文件在后，均按名称（数值感知、大小写不敏感）', () => {
  const tree = buildFileTree(['b.txt', 'a10.ts', 'a2.ts', 'dir2/x.ts', 'dir10/y.ts', 'a.ts']);
  expect(names(tree)).toEqual(['dir2', 'dir10', 'a.ts', 'a2.ts', 'a10.ts', 'b.txt']);
});

test('共享前缀路径合并到同一目录链', () => {
  const tree = buildFileTree(['a/b/c1.ts', 'a/b/c2.ts', 'a/d.ts']);
  expect(tree).toHaveLength(1);
  const a = tree[0];
  expect(names(a?.children ?? [])).toEqual(['b', 'd.ts']);
  expect(a?.children[0]?.children).toHaveLength(2);
});

test('空输入/空串条目返回空数组', () => {
  expect(buildFileTree([])).toEqual([]);
  expect(buildFileTree([''])).toEqual([]);
});

test('深层路径完整保留层级', () => {
  const tree = buildFileTree(['a/b/c/d/e.ts']);
  let node = tree[0];
  const seen: string[] = [];
  for (let depth = 0; depth < 5; depth += 1) {
    seen.push(`${node?.name}:${node?.kind}`);
    node = node?.children[0];
  }
  expect(seen).toEqual(['a:dir', 'b:dir', 'c:dir', 'd:dir', 'e.ts:file']);
});
