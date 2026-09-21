import { describe, expect, test } from 'bun:test';
import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createGitBranches } from '@paiapp/api';

import { runGit } from '../git-exec';

/**
 * git 执行器（GitExec 的 execFile 默认实现）：真子进程集成——工作目录不存在的
 * 归类、仓库自带可执行面（hooks/fsmonitor）的隔离。纯逻辑与 fake 执行器用例
 * 在 @paiapp/api verbs/__test__/git-branches.test.ts。
 */

describe('runGit 执行器（真子进程）', () => {
  test('工作目录不存在 → cwd_not_found（不误报成 git 不在 PATH）', async () => {
    const gone = join(mkdtempSync(join(tmpdir(), 'pai-git-gone-')), 'inner');
    rmSync(gone, { recursive: true, force: true });
    expect(await createGitBranches(runGit).list(gone)).toEqual({ ok: false, error: { kind: 'cwd_not_found' } });
  });

  test('真 git：仓库自带 post-checkout hook 与 core.fsmonitor 不被执行（恶意仓库不能在主进程跑代码）', async () => {
    const repo = mkdtempSync(join(tmpdir(), 'pai-git-hooks-'));
    const marker = join(repo, 'pwned.txt');
    const git = (...args: string[]): string =>
      execFileSync('git', ['-c', 'user.email=pai@test', '-c', 'user.name=pai', ...args], { cwd: repo }).toString();
    try {
      git('init', '-b', 'main');
      writeFileSync(join(repo, 'a.txt'), 'a\n');
      git('add', '.');
      git('commit', '-m', 'init');
      git('branch', 'dev');
      // 仓库本地 config 指定 hook 目录与 fsmonitor 脚本（克隆来的恶意仓库正是这么干的）
      const hooks = join(repo, 'evilhooks');
      mkdirSync(hooks, { recursive: true });
      const hookPath = join(hooks, 'post-checkout');
      writeFileSync(hookPath, `#!/bin/sh\necho pwned > '${marker}'\n`);
      chmodSync(hookPath, 0o755);
      git('config', 'core.hooksPath', hooks);
      const fsmonitor = join(repo, 'evil-fsm.sh');
      writeFileSync(fsmonitor, `#!/bin/sh\necho pwned > '${marker}'\nexit 0\n`);
      chmodSync(fsmonitor, 0o755);
      git('config', 'core.fsmonitor', fsmonitor);

      // 对照组：不经本模块的裸 git checkout 确实会执行该 hook（证明本用例非恒真）
      execFileSync('git', ['checkout', 'main'], { cwd: repo });
      expect(existsSync(marker)).toBe(true);
      rmSync(marker, { force: true });

      const outcome = await createGitBranches(runGit).checkout(repo, 'dev', false);
      expect(outcome.ok).toBe(true);
      // 分支真的切了（功能未被隔离破坏）
      expect(git('rev-parse', '--abbrev-ref', 'HEAD').trim()).toBe('dev');
      // 但仓库自带可执行面一个都没跑
      expect(existsSync(marker)).toBe(false);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });
});
