import { describe, expect, test } from 'bun:test';
import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { classifyGitExecError, createGitBranches, isValidBranchName, mapGitFailure, parseBranchList, parseDirtyCount, type GitExec, type GitExecResult } from '../git-branches';

/**
 * 本地 git 分支能力（T23）：纯函数分类 + fake 执行器驱动的行为
 * （非仓库空形态 / 脏工作区拒绝 / 创建并检出 / 同 cwd 单飞与串行）。
 */

const ok = (stdout: string): GitExecResult => ({ code: 0, stdout, stderr: '', error: null });
const fail = (stderr: string, code = 128): GitExecResult => ({ code, stdout: '', stderr, error: null });
/** 进程级异常（超时/输出超限/启动失败）：code 为 null，原因在 error 上。 */
const proc = (error: GitExecResult['error']): GitExecResult => ({ code: null, stdout: '', stderr: '', error });

describe('parseBranchList', () => {
  test('去空行、去重、升序', () => {
    expect(parseBranchList('main\ndev\nmain\n\n  feat/a  \n')).toEqual(['dev', 'feat/a', 'main']);
  });

  test('空输出 → 空数组', () => {
    expect(parseBranchList('')).toEqual([]);
    expect(parseBranchList('\n\n')).toEqual([]);
  });

  test('非法分支名不呈现（`-f`/`--detach` 这类 ref 可被 for-each-ref 列出，点选会变成 git 选项）', () => {
    expect(parseBranchList('-f\n--detach\nmain\nrefs/x\n')).toEqual(['main', 'refs/x']);
  });
});

describe('parseDirtyCount', () => {
  test.each([
    ['空输出', '', 0],
    ['仅空白行', '\n \n', 0],
    ['单文件改动', 'M a.ts\n', 1],
    ['多文件改动', 'M a.ts\n M b.ts\nD c.ts\n', 3],
  ])('%s → %d', (_name: string, stdout: string, expected: number) => {
    expect(parseDirtyCount(stdout)).toBe(expected);
  });
});

describe('isValidBranchName', () => {
  test.each(['main', 'feat/x', 'release-1.2', 'v0.6.1', 'a_b-c.d'])('%s 合法', (name: string) => {
    expect(isValidBranchName(name)).toBe(true);
  });

  test.each(['', '-f', '--detach', '/x', 'x/', 'a//b', '.x', 'x.', 'a..b', '@', 'a@{0}', 'x.lock', 'a b', 'a~1', 'a^', 'a:b', 'a?b', 'a*b', 'a[b', 'a\\b', 'a\u0001b', 'HEAD'])('%s 非法', (name: string) => {
    expect(isValidBranchName(name)).toBe(false);
  });
});

describe('classifyGitExecError（平台语义：用真子进程实测过的 error 形状）', () => {
  test('ENOENT（命令不存在）→ spawn_failed', () => {
    expect(classifyGitExecError({ code: 'ENOENT', killed: false, signal: null })).toBe('spawn_failed');
  });

  test('超时杀进程（killed + SIGTERM）→ timeout', () => {
    expect(classifyGitExecError({ code: null, killed: true, signal: 'SIGTERM' })).toBe('timeout');
  });

  test('maxBuffer 溢出（RangeError 形，无 killed/signal）→ output_too_large', () => {
    expect(classifyGitExecError({ code: 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER' })).toBe('output_too_large');
  });

  test('非零退出（数字 code）→ null（交 stderr 分类）', () => {
    expect(classifyGitExecError({ code: 128, killed: false, signal: null })).toBeNull();
  });
});

describe('mapGitFailure', () => {
  test.each([
    ['非仓库', 'fatal: not a git repository (or any of the parent directories): .git', 'not_a_repo'],
    ['分支已存在', "fatal: a branch named 'feat' already exists", 'branch_exists'],
    ['未知分支', "error: pathspec 'nope' did not match any file(s) known to git", 'unknown_branch'],
    ['脏工作区', 'error: Your local changes to the following files would be overwritten by checkout:', 'dirty_worktree'],
    ['提示提交改动', 'Please commit your changes or stash them before you switch branches.', 'dirty_worktree'],
  ])('%s → %s', (_name: string, stderr: string, reason: string) => {
    expect(mapGitFailure(stderr)).toBe(reason);
  });

  test('未识别错误带首行摘要，空输出退化为 git_failed:unknown', () => {
    expect(mapGitFailure('fatal: unable to read tree\nmore')).toBe('git_failed:fatal: unable to read tree');
    expect(mapGitFailure('')).toBe('git_failed:unknown');
    expect(mapGitFailure('   \n  ')).toBe('git_failed:unknown');
  });
});

/** fake 执行器：按参数前缀派发，记录调用序列。 */
function makeExec(handlers: ReadonlyArray<{ match: string; result: GitExecResult }>): { exec: GitExec; calls: string[] } {
  const calls: string[] = [];
  const exec: GitExec = (args, cwd) => {
    const key = args.join(' ');
    calls.push(`${cwd}|${key}`);
    const handler = handlers.find((entry) => key.startsWith(entry.match));
    return Promise.resolve(handler?.result ?? fail(`fatal: no handler for ${key}`));
  };
  return { exec, calls };
}

describe('list', () => {
  test('非仓库返回空形态（不报错）', async () => {
    const { exec } = makeExec([{ match: 'rev-parse --git-dir', result: fail('fatal: not a git repository') }]);
    expect(await createGitBranches(exec).list('/w/plain')).toEqual({
      ok: true,
      data: { isRepo: false, current: null, branches: [], dirtyFiles: 0 },
    });
  });

  test('仓库返回当前分支、升序分支列表与未提交文件数', async () => {
    const { exec } = makeExec([
      { match: 'rev-parse --git-dir', result: ok('.git') },
      { match: 'for-each-ref', result: ok('main\nfeature/x\nmain\n') },
      { match: 'symbolic-ref', result: ok('feature/x\n') },
      { match: 'status --porcelain', result: ok('M a.ts\n M b.ts\n') },
    ]);
    expect(await createGitBranches(exec).list('/w/repo')).toEqual({
      ok: true,
      data: { isRepo: true, current: 'feature/x', branches: ['feature/x', 'main'], dirtyFiles: 2 },
    });
  });

  test('干净工作区 → dirtyFiles 为 0', async () => {
    const { exec } = makeExec([
      { match: 'rev-parse --git-dir', result: ok('.git') },
      { match: 'for-each-ref', result: ok('main\n') },
      { match: 'symbolic-ref', result: ok('main\n') },
      { match: 'status --porcelain', result: ok('') },
    ]);
    expect(await createGitBranches(exec).list('/w/repo')).toEqual({
      ok: true,
      data: { isRepo: true, current: 'main', branches: ['main'], dirtyFiles: 0 },
    });
  });

  test('detached HEAD（symbolic-ref 非零）→ current 为 null', async () => {
    const { exec } = makeExec([
      { match: 'rev-parse --git-dir', result: ok('.git') },
      { match: 'for-each-ref', result: ok('main\n') },
      { match: 'symbolic-ref', result: fail('', 1) },
      { match: 'status --porcelain', result: ok('') },
    ]);
    const outcome = await createGitBranches(exec).list('/w/repo');
    expect(outcome).toEqual({ ok: true, data: { isRepo: true, current: null, branches: ['main'], dirtyFiles: 0 } });
  });

  test('git 缺失（启动失败）→ git_unavailable；超时/输出超限各有独立 reason', async () => {
    const missing = makeExec([{ match: 'rev-parse', result: proc('spawn_failed') }]);
    expect(await createGitBranches(missing.exec).list('/w/repo')).toEqual({ ok: false, reason: 'git_unavailable' });

    const timedOut = makeExec([{ match: 'rev-parse', result: proc('timeout') }]);
    expect(await createGitBranches(timedOut.exec).list('/w/repo')).toEqual({ ok: false, reason: 'git_failed:timeout' });

    const tooLarge = makeExec([{ match: 'rev-parse', result: ok('.git') }, { match: 'for-each-ref', result: proc('output_too_large') }]);
    expect(await createGitBranches(tooLarge.exec).list('/w/repo')).toEqual({ ok: false, reason: 'git_failed:output_too_large' });
  });

  test('执行中途的进程级异常（for-each-ref 超时）也归到 timeout，不误报 git_unavailable', async () => {
    const { exec } = makeExec([
      { match: 'rev-parse --git-dir', result: ok('.git') },
      { match: 'for-each-ref', result: proc('timeout') },
    ]);
    expect(await createGitBranches(exec).list('/w/repo')).toEqual({ ok: false, reason: 'git_failed:timeout' });
  });

  test('非仓库以外的探测失败照实透传', async () => {
    const { exec } = makeExec([{ match: 'rev-parse', result: fail('fatal: detected dubious ownership in repository') }]);
    expect(await createGitBranches(exec).list('/w/repo')).toEqual({
      ok: false,
      reason: 'git_failed:fatal: detected dubious ownership in repository',
    });
  });

  test('默认执行器：工作目录不存在 → cwd_not_found（不误报成 git 不在 PATH）', async () => {
    const gone = join(mkdtempSync(join(tmpdir(), 'pai-git-gone-')), 'inner');
    rmSync(gone, { recursive: true, force: true });
    expect(await createGitBranches().list(gone)).toEqual({ ok: false, reason: 'cwd_not_found' });
  });

  test('同 cwd 并发请求在途复用（只探测一次）', async () => {
    let probeCount = 0;
    const exec: GitExec = (args) => {
      if (args[0] === 'rev-parse') probeCount += 1;
      if (args[0] === 'rev-parse') return Promise.resolve(ok('.git'));
      if (args[0] === 'for-each-ref') return Promise.resolve(ok('main\n'));
      return Promise.resolve(ok('main\n'));
    };
    const git = createGitBranches(exec);
    const [a, b] = await Promise.all([git.list('/w/repo'), git.list('/w/repo')]);
    expect(a).toEqual(b);
    expect(probeCount).toBe(1);
  });
});

describe('checkout', () => {
  test('切到既有分支：干净工作区放行', async () => {
    const { exec, calls } = makeExec([
      { match: 'rev-parse --git-dir', result: ok('.git') },
      { match: 'for-each-ref', result: ok('main\ndev\n') },
      { match: 'symbolic-ref', result: ok('main\n') },
      { match: 'status --porcelain', result: ok('') },
      { match: 'checkout dev', result: ok('Switched to branch dev') },
    ]);
    expect(await createGitBranches(exec).checkout('/w/repo', 'dev', false)).toEqual({ ok: true, data: { branch: 'dev' } });
    expect(calls.some((call) => call.includes('checkout dev'))).toBe(true);
  });

  test('已在目标分支：跳过脏检查直接成功', async () => {
    const { exec, calls } = makeExec([
      { match: 'rev-parse --git-dir', result: ok('.git') },
      { match: 'for-each-ref', result: ok('main\ndev\n') },
      { match: 'symbolic-ref', result: ok('main\n') },
    ]);
    expect(await createGitBranches(exec).checkout('/w/repo', 'main', false)).toEqual({ ok: true, data: { branch: 'main' } });
    expect(calls.some((call) => call.includes('status'))).toBe(false);
    expect(calls.some((call) => call.includes('checkout '))).toBe(false);
  });

  test('脏工作区（已跟踪文件改动）拒绝切换', async () => {
    const { exec } = makeExec([
      { match: 'rev-parse --git-dir', result: ok('.git') },
      { match: 'for-each-ref', result: ok('main\ndev\n') },
      { match: 'symbolic-ref', result: ok('main\n') },
      { match: 'status --porcelain', result: ok(' M src/a.ts\n') },
    ]);
    expect(await createGitBranches(exec).checkout('/w/repo', 'dev', false)).toEqual({ ok: false, reason: 'dirty_worktree' });
  });

  test('未知分支拒绝，不执行 checkout', async () => {
    const { exec, calls } = makeExec([
      { match: 'rev-parse --git-dir', result: ok('.git') },
      { match: 'for-each-ref', result: ok('main\n') },
    ]);
    expect(await createGitBranches(exec).checkout('/w/repo', 'nope', false)).toEqual({ ok: false, reason: 'unknown_branch' });
    expect(calls.some((call) => call.includes('checkout'))).toBe(false);
  });

  test('创建并检出：重名拒绝；脏树允许（新建分支不改工作树）', async () => {
    const dup = makeExec([
      { match: 'rev-parse --git-dir', result: ok('.git') },
      { match: 'for-each-ref', result: ok('main\n') },
    ]);
    expect(await createGitBranches(dup.exec).checkout('/w/repo', 'main', true)).toEqual({ ok: false, reason: 'branch_exists' });

    const created = makeExec([
      { match: 'rev-parse --git-dir', result: ok('.git') },
      { match: 'for-each-ref', result: ok('main\n') },
      { match: 'symbolic-ref', result: ok('main\n') },
      { match: 'checkout -b feat/new', result: ok('Switched to a new branch') },
    ]);
    expect(await createGitBranches(created.exec).checkout('/w/repo', 'feat/new', true)).toEqual({
      ok: true,
      data: { branch: 'feat/new' },
    });
    expect(created.calls.some((call) => call.includes('status'))).toBe(false);
  });

  test('git 缺失与 checkout 失败各自收窄为契约 reason', async () => {
    const missing = makeExec([{ match: 'rev-parse', result: proc('spawn_failed') }]);
    expect(await createGitBranches(missing.exec).checkout('/w/repo', 'dev', false)).toEqual({
      ok: false,
      reason: 'git_unavailable',
    });

    const failed = makeExec([
      { match: 'rev-parse --git-dir', result: ok('.git') },
      { match: 'for-each-ref', result: ok('main\ndev\n') },
      { match: 'symbolic-ref', result: ok('main\n') },
      { match: 'status --porcelain', result: ok('') },
      { match: 'checkout dev', result: fail('error: Your local changes to the following files would be overwritten') },
    ]);
    expect(await createGitBranches(failed.exec).checkout('/w/repo', 'dev', false)).toEqual({
      ok: false,
      reason: 'dirty_worktree',
    });
  });

  test('非法分支名（选项形）先于 git 拦住：不执行任何 git 命令，不把 `--detach` 报成切换成功', async () => {
    const { exec, calls } = makeExec([
      { match: 'rev-parse --git-dir', result: ok('.git') },
      { match: 'for-each-ref', result: ok('main\n') },
    ]);
    expect(await createGitBranches(exec).checkout('/w/repo', '--detach', false)).toEqual({ ok: false, reason: 'invalid_branch' });
    expect(await createGitBranches(exec).checkout('/w/repo', '-f', false)).toEqual({ ok: false, reason: 'invalid_branch' });
    expect(await createGitBranches(exec).checkout('/w/repo', 'bad name', true)).toEqual({ ok: false, reason: 'invalid_branch' });
    expect(calls).toEqual([]);
  });

  test('切换成功后失效列表在途缓存：紧随的 list 重新探测（不复用切换前快照）', async () => {
    const calls: string[] = [];
    const gates: Array<() => void> = [];
    const exec: GitExec = (args) => {
      const key = args.join(' ');
      calls.push(key);
      if (key === 'rev-parse --git-dir') {
        // 第一次 list 的探测挂起，模拟慢仓库；后续直接放行
        if (gates.length === 0 && calls.filter((call) => call === key).length === 1) {
          return new Promise<GitExecResult>((resolve) => {
            gates.push(() => resolve(ok('.git')));
          });
        }
        return Promise.resolve(ok('.git'));
      }
      if (key.startsWith('for-each-ref')) return Promise.resolve(ok('main\ndev\n'));
      if (key === 'symbolic-ref --short -q HEAD') return Promise.resolve(ok('main\n'));
      if (key === 'status --porcelain --untracked-files=no') return Promise.resolve(ok(''));
      return Promise.resolve(ok('Switched'));
    };
    const git = createGitBranches(exec);
    const pending = git.list('/w/repo');
    expect(await git.checkout('/w/repo', 'dev', false)).toEqual({ ok: true, data: { branch: 'dev' } });
    const probes = calls.filter((call) => call === 'rev-parse --git-dir').length;
    const after = git.list('/w/repo');
    for (let i = 0; i < 5; i += 1) await Promise.resolve();
    // 缓存已失效：第二次 list 发了新探测（不是复用 pending 的那一笔）
    expect(calls.filter((call) => call === 'rev-parse --git-dir').length).toBe(probes + 1);
    for (const release of gates.splice(0)) release();
    expect((await pending).ok).toBe(true);
    expect((await after).ok).toBe(true);
  });

  test('切换全局串行（跨 cwd 也不插队，后发不插队）', async () => {
    const order: string[] = [];
    const gates: Array<() => void> = [];
    const exec: GitExec = (args, cwd) => {
      const key = args.join(' ');
      if (key === 'rev-parse --git-dir') return Promise.resolve(ok('.git'));
      if (key.startsWith('for-each-ref')) return Promise.resolve(ok('main\ndev\nfeat\n'));
      if (key === 'symbolic-ref --short -q HEAD') return Promise.resolve(ok('main\n'));
      if (key === 'status --porcelain --untracked-files=no') return Promise.resolve(ok(''));
      order.push(`${cwd}|${key}`);
      if (key === 'checkout dev') {
        return new Promise<GitExecResult>((resolve) => {
          gates.push(() => resolve(ok('Switched to branch dev')));
        });
      }
      return Promise.resolve(ok('Switched'));
    };
    const git = createGitBranches(exec);
    // 两个不同 cwd（可能是同一仓库的不同子目录）：也必须串行
    const first = git.checkout('/w/repo', 'dev', false);
    const second = git.checkout('/w/repo/sub', 'feat', false);
    for (let i = 0; i < 20; i += 1) await Promise.resolve();
    // 第一笔未结算时第二笔不得进入执行阶段
    expect(order).toEqual(['/w/repo|checkout dev']);
    for (const release of gates.splice(0)) release();
    expect((await first).ok).toBe(true);
    expect((await second).ok).toBe(true);
    expect(order).toEqual(['/w/repo|checkout dev', '/w/repo/sub|checkout feat']);
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

      const outcome = await createGitBranches().checkout(repo, 'dev', false);
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
