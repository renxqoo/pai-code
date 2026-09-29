import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import { promisify } from 'node:util';

import { createGitWorktree } from '@paiapp/api';
import type { GitWorktree } from '@paiapp/api';
import { withRepoLock } from '../repo-lock';

const exec = promisify(execFile);

/**
 * 会话级 worktree 全旅程（SESSION-WORKTREE-WORKFLOW §7 阶段 5）：
 * 隔离世界（临时仓 + 真二进制 + 全真 verb 装配），断言业务终态——
 * 建树 → 树内工作（非零提交——零提交树测不出收编链）→ 清理被拒（未合并）
 * → 合并回主仓 → 清理放行 → 双清终态；含树内发起拒/回滚旅程。
 */

let work: string;
let project: string;
let gitWorktree: GitWorktree;
let removedTrees: string[];

beforeAll(async () => {
  work = mkdtempSync(join(tmpdir(), 'xh-wt-e2e-'));
  project = join(work, 'project');
  mkdirSync(project, { recursive: true });
  await exec('git', ['-C', project, 'init']);
  await exec('git', ['-C', project, 'config', 'user.email', 't@t']);
  await exec('git', ['-C', project, 'config', 'user.name', 't']);
  writeFileSync(join(project, 'README.md'), 'seed\n');
  await exec('git', ['-C', project, 'add', '.']);
  await exec('git', ['-C', project, 'commit', '-m', 'base']);

  const runGit = (args: readonly string[], cwd: string) =>
    new Promise<{ code: number | null; stdout: string; stderr: string; error: string | null }>((resolveRun) => {
      execFile('git', args, { cwd }, (error, stdout, stderr) => {
        if (error === null) {
          resolveRun({ code: 0, stdout: String(stdout ?? ''), stderr: String(stderr ?? ''), error: null });
          return;
        }
        const code = (error as { code?: unknown }).code;
        resolveRun({ code: typeof code === 'number' ? code : null, stdout: String(stdout ?? ''), stderr: String(stderr ?? ''), error: typeof code === 'number' ? null : 'spawn_failed' });
      });
    });

  gitWorktree = createGitWorktree(runGit, {
    isAbsolute,
    resolve,
    dirname,
    join,
    basename,
    exists: existsSync,
    realpath: (path) => realpathSync(path),
    withRepoLock,
  });
  removedTrees = [];
});

afterAll(() => {
  rmSync(work, { recursive: true, force: true });
});

describe('worktree 全旅程（真 git 全真装配）', () => {
  test('建树 → 树内工作 → 清理被拒（未合并）→ 合并回主仓 → 清理放行 → 双清', async () => {
    const created = await gitWorktree.create(project, 'feat/login');
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const treePath = created.data.path;
    expect(existsSync(treePath)).toBe(true);
    expect(treePath).toContain('.x-harness-user-worktrees');

    // 树内工作：非零提交（agent 的典型形态——commit 后工作区干净但分支未合并）
    writeFileSync(join(treePath, 'login.ts'), 'export const login = (): string => "ok";\n');
    await exec('git', ['-C', treePath, 'add', '.']);
    await exec('git', ['-C', treePath, 'commit', '-m', 'login feature']);
    const status = await exec('git', ['-C', treePath, 'status', '--porcelain']);
    expect(status.stdout.trim()).toBe(''); // 净树

    // 清理被拒：未合并（数据安全门锁住有价值的工作）
    const blocked = await gitWorktree.remove(project, treePath);
    expect(blocked.ok).toBe(false);
    if (blocked.ok) return;
    expect(blocked.error.kind).toBe('worktree_dirty');
    expect(blocked.error.message).toContain('未并入');

    // 合并回主仓（收编——生命周期的中间环节）
    const merged = await gitWorktree.merge(project, 'feat/login');
    expect(merged.ok).toBe(true);
    const tip = await exec('git', ['-C', project, 'rev-parse', 'feat/login']);
    const contained = await exec('git', ['-C', project, 'merge-base', '--is-ancestor', tip.stdout.trim(), 'HEAD']).then(
      () => true,
      () => false,
    );
    expect(contained).toBe(true); // 收编真语义：分支 tip 被主仓 HEAD 包含

    // 清理放行：合并后门开 → 双清终态
    const removed = await gitWorktree.remove(project, treePath);
    expect(removed.ok).toBe(true);
    expect(existsSync(treePath)).toBe(false);
    const branchGone = await exec('git', ['-C', project, 'branch', '--list', 'feat/login']);
    expect(branchGone.stdout.trim()).toBe('');
    removedTrees.push(treePath);
  }, 30_000);

  test('树内 cwd 发起合并 → worktree_nested（防 Already-up-to-date 假成功）', async () => {
    const created = await gitWorktree.create(project, 'feat/nested-guard');
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const blocked = await gitWorktree.merge(created.data.path, 'feat/nested-guard');
    expect(blocked.ok).toBe(false);
    if (blocked.ok) return;
    expect(blocked.error.kind).toBe('worktree_nested');
    // 收尾：主仓侧合并清理
    await gitWorktree.merge(project, 'feat/nested-guard');
    await gitWorktree.remove(project, created.data.path);
  }, 30_000);

  test('脏树清理被拒（ignored 文件不随树静默删除）', async () => {
    const created = await gitWorktree.create(project, 'feat/dirty-guard');
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    writeFileSync(join(created.data.path, '.env'), 'SECRET=1\n');
    writeFileSync(join(created.data.path, '.gitignore'), '.env\n');
    const blocked = await gitWorktree.remove(project, created.data.path);
    expect(blocked.error?.kind).toBe('worktree_dirty');
    expect(blocked.error?.message).toContain('忽略');
    // 收尾：清掉文件再合并清理
    rmSync(join(created.data.path, '.env'));
    rmSync(join(created.data.path, '.gitignore'));
    await gitWorktree.merge(project, 'feat/dirty-guard');
    await gitWorktree.remove(project, created.data.path);
  }, 30_000);

  test('同分支重建（清理后路径与分支可复用）', async () => {
    const first = await gitWorktree.create(project, 'feat/reuse');
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    await gitWorktree.remove(project, first.data.path); // 零提交树直接可清
    const second = await gitWorktree.create(project, 'feat/reuse');
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.data.path).toBe(first.data.path);
    await gitWorktree.remove(project, second.data.path);
  }, 30_000);
});
