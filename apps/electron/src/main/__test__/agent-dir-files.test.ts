import { afterEach, expect, test } from 'bun:test';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createAgentDirFiles } from '../agent-dir-files';

/** agentDir 受控文件面回归：白名单拒逃逸、原子写、坏文件降级。 */

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function tempAgentDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'pai-agentdir-'));
  dirs.push(dir);
  return dir;
}

test('白名单外文件名读写一律拒绝（含路径穿越形态）', () => {
  const files = createAgentDirFiles(tempAgentDir());
  expect(files.readJson('../settings.json')).toBeNull();
  expect(files.readJson('sessions/evil.json')).toBeNull();
  expect(files.readJson('sub/dir/x.json')).toBeNull();
  expect(files.writeJsonAtomic('../evil.json', { a: 1 })).toBe(false);
  expect(files.writeJsonAtomic('other.json', { a: 1 })).toBe(false);
});

test('白名单内文件：写入→读回；原子写不留 .tmp 残留', () => {
  const dir = tempAgentDir();
  const files = createAgentDirFiles(dir);
  const rules = { mode: 'block-all', bash: { allowPatterns: [], blockPatterns: ['sudo *'] } };
  expect(files.writeJsonAtomic('permission-rules.json', rules)).toBe(true);
  expect(files.readJson('permission-rules.json')).toEqual(rules);
  expect(existsSync(join(dir, 'permission-rules.json.tmp'))).toBe(false);
  const onDisk = JSON.parse(readFileSync(join(dir, 'permission-rules.json'), 'utf8')) as { mode: string };
  expect(onDisk.mode).toBe('block-all');
});

test('缺文件与坏 JSON 读降级 null（不抛）', () => {
  const dir = tempAgentDir();
  const files = createAgentDirFiles(dir);
  expect(files.readJson('permission-rules.json')).toBeNull();
  writeFileSync(join(dir, 'permission-rules.json'), '{truncated', 'utf8');
  expect(files.readJson('permission-rules.json')).toBeNull();
});

test('tmp 文件随机名 + 独占创建：预置固定名符号链接不构成写穿面', () => {
  const dir = tempAgentDir();
  const files = createAgentDirFiles(dir);
  // 即便目录内预置了恶意符号链接，固定名 tmp 已不存在（随机名 + wx）
  expect(files.writeJsonAtomic('permission-rules.json', { mode: 'ask' })).toBe(true);
  const leftovers = readdirSync(dir).filter((name) => name.endsWith('.tmp'));
  expect(leftovers).toEqual([]);
});
