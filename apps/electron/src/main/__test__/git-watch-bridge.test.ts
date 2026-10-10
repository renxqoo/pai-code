// git-watch-bridge 单测：声明驱动挂/收（引用计数）、变更广播（cwd 匹配）、
// 非 git cwd 不锚、dispose 全收（无泄漏红线）。

import { describe, expect, test } from 'bun:test';
import { execFile } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { createGitWatchBridge } from '../git-watch-bridge';
import type { UiEvent } from '@x3code/contracts';

const exec = promisify(execFile);

async function gitRepo(): Promise<string> {
  const parent = mkdtempSync(join(tmpdir(), 'bridge-'));
  const dir = join(parent, 'repo');
  mkdirSync(dir, { recursive: true });
  await exec('git', ['-C', dir, 'init']);
  await exec('git', ['-C', dir, 'config', 'user.email', 't@t']);
  await exec('git', ['-C', dir, 'config', 'user.name', 't']);
  writeFileSync(join(dir, 'F'), 'x');
  await exec('git', ['-C', dir, 'add', '.']);
  await exec('git', ['-C', dir, 'commit', '-m', 's']);
  return realpathSync(dir);
}

const settle = (ms: number): Promise<void> => new Promise((resolve) => { setTimeout(() => resolve(), ms); });

describe('createGitWatchBridge（声明驱动 gitdir watch 兜底）', () => {
  test('外部 switch → 广播 gitChanged（cwd 匹配声明面）', async () => {
    const repo = await gitRepo();
    const events: UiEvent[] = [];
    const bridge = createGitWatchBridge((e) => events.push(e), (cwd) => join(cwd, '.git'));
    bridge.watchCwd(repo);
    await settle(100);
    await exec('git', ['-C', repo, 'checkout', '-b', 'feat/bridge']);
    await settle(600);
    expect(events.some((e) => e.type === 'gitChanged' && e.cwd === repo)).toBe(true);
    bridge.dispose();
  }, 10_000);

  test('非 git cwd（gitDirOf null）不锚、不广播', async () => {
    const events: UiEvent[] = [];
    const bridge = createGitWatchBridge((e) => events.push(e), () => null);
    bridge.watchCwd('/w/not-a-repo');
    await settle(100);
    expect(events).toEqual([]);
    bridge.dispose();
  });

  test('同 gitdir 多 cwd：一变多播；引用归零收锚（unwatch 后不再广播）', async () => {
    const repo = await gitRepo();
    const sub = join(repo, 'sub');
    mkdirSync(sub);
    const events: UiEvent[] = [];
    const bridge = createGitWatchBridge((e) => events.push(e), (cwd) => join(cwd, '.git'));
    bridge.watchCwd(repo);
    bridge.watchCwd(sub);
    await settle(100);
    await exec('git', ['-C', repo, 'checkout', '-b', 'multi/x']);
    await settle(600);
    const cwds = new Set(events.filter((e) => e.type === 'gitChanged').map((e) => (e as { cwd: string }).cwd));
    expect(cwds.has(repo)).toBe(true); // 两声明都收（一变多播）
    // 全部 unwatch → 锚收 → 后续变更无事件（无泄漏）
    bridge.unwatchCwd(repo);
    bridge.unwatchCwd(sub);
    await settle(100);
    const before = events.length;
    await exec('git', ['-C', repo, 'checkout', '-b', 'after-close']);
    await settle(600);
    expect(events.length).toBe(before);
    bridge.dispose();
  }, 10_000);
});
