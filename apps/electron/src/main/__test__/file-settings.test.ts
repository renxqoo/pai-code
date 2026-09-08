import { afterEach, expect, test } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync, existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createFileSettings, type ProviderKeyStore } from '../file-settings';

/** settings.json 读写回归：原子写（无 .tmp 残留）、部分写、坏文件降级。 */

const dirs: string[] = [];

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'pai-settings-'));
  dirs.push(dir);
  return dir;
}

const memoryKeyStore: ProviderKeyStore = {
  encryptionAvailable: false,
  getKey: () => null,
  setKey: () => undefined,
  keyNames: [],
};

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

test('patch 部分写：只动目标字段，其余保留；落盘可再读', () => {
  const dir = tempDir();
  const file = join(dir, 'settings.json');
  const settings = createFileSettings(file, memoryKeyStore);
  settings.patch({ trustedDefault: true });
  settings.patch({ onboarded: true, defaultModel: 'glm/glm-4.7' });

  settings.patch({ projectModels: { '/w': 'glm/glm-4.7' }, pinnedSessions: ['/a.jsonl'] });

  expect(settings.get()).toEqual({
    hubDev: { bunPath: null, hubEntry: null },
    providers: [],
    trustedDefault: true,
    defaultModel: 'glm/glm-4.7',
    onboarded: true,
    projectModels: { '/w': 'glm/glm-4.7' },
    pinnedSessions: ['/a.jsonl'],
  });

  // 新实例从盘读回（缓存不背书）
  expect(createFileSettings(file, memoryKeyStore).get().onboarded).toBe(true);
  // 原子写：不留临时文件
  expect(existsSync(`${file}.tmp`)).toBe(false);
});

test('坏文件降级默认值（垃圾输入不崩溃）', () => {
  const dir = tempDir();
  const file = join(dir, 'settings.json');
  writeFileSync(file, '{"providers": [truncated', 'utf8');
  const settings = createFileSettings(file, memoryKeyStore);
  expect(settings.get().providers).toEqual([]);
  expect(settings.get().onboarded).toBe(false);
});

test('空输入落到 schema 默认值（含新增偏好字段）', () => {
  const dir = tempDir();
  const settings = createFileSettings(join(dir, 'settings.json'), memoryKeyStore);
  const parsed = settings.get();
  expect(parsed.defaultModel).toBeNull();
  expect(parsed.onboarded).toBe(false);
  expect(parsed.trustedDefault).toBe(false);
  expect(parsed.providers).toEqual([]);
});

test('upsertProvider 按 name 键替换并落盘', () => {
  const dir = tempDir();
  const file = join(dir, 'settings.json');
  const settings = createFileSettings(file, memoryKeyStore);
  settings.upsertProvider({ name: 'glm', baseUrl: 'https://a', api: 'openai-completions', models: ['m'] });
  settings.upsertProvider({ name: 'glm', baseUrl: 'https://b', api: 'openai-completions', models: ['m2'] });
  const onDisk = JSON.parse(readFileSync(file, 'utf8')) as { providers: Array<{ baseUrl: string }> };
  expect(onDisk.providers.length).toBe(1);
  expect(onDisk.providers[0]?.baseUrl).toBe('https://b');
});
