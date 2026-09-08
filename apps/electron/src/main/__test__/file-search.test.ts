import { afterEach, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { searchProjectFiles } from '../file-search';

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function project(): string {
  const dir = mkdtempSync(join(tmpdir(), 'pai-filesearch-'));
  dirs.push(dir);
  writeFileSync(join(dir, 'main.ts'), 'x');
  writeFileSync(join(dir, 'README.md'), 'x');
  mkdirSync(join(dir, 'src'));
  writeFileSync(join(dir, 'src', 'app.ts'), 'x');
  writeFileSync(join(dir, 'src', 'util.ts'), 'x');
  mkdirSync(join(dir, 'node_modules', 'pkg'), { recursive: true });
  writeFileSync(join(dir, 'node_modules', 'pkg', 'evil.js'), 'x');
  mkdirSync(join(dir, '.git'));
  writeFileSync(join(dir, '.git', 'config'), 'x');
  return dir;
}

test('相对路径 + 大小写不敏感子串 + 跳过 node_modules/.git/点前缀', () => {
  const dir = project();
  const all = searchProjectFiles(dir, '');
  expect(all).toEqual(['README.md', 'main.ts', 'src/app.ts', 'src/util.ts']);
  expect(searchProjectFiles(dir, 'APP')).toEqual(['src/app.ts']);
  expect(searchProjectFiles(dir, 'md')).toEqual(['README.md']);
});

test('空查询全量、无命中空数组、坏目录降级空数组', () => {
  const dir = project();
  expect(searchProjectFiles(dir, 'zzz')).toEqual([]);
  expect(searchProjectFiles(join(dir, 'nonexistent'), '')).toEqual([]);
});

test('符号链接不跟随遍历（按文件计，不进目录）', () => {
  const dir = project();
  const outside = mkdtempSync(join(tmpdir(), 'pai-outside-'));
  dirs.push(outside);
  writeFileSync(join(outside, 'secret.ts'), 'x');
  symlinkSync(outside, join(dir, 'link'));
  const all = searchProjectFiles(dir, 'secret');
  expect(all).toEqual([]);
  // 链接本身可被引用为路径
  expect(searchProjectFiles(dir, 'link')).toEqual(['link']);
});
