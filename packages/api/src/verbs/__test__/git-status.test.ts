import { describe, expect, test } from 'bun:test';

import { createGitStatus, parseNumstat, parseNumstatLine, parseRevListCount, parseStatusLine, parseStatusPorcelain, STATUS_FILES_LIMIT, type GitStatus } from '../git-status';
import type { GitExec, GitExecResult } from '../git-branches';

/**
 * 工作区变更速览（T44）：纯函数解析（porcelain/numstat/rev-list）+ fake 执行器
 * 驱动的行为（非仓库空形态 / 空仓库计数降级 / 无上游降级 / 截断 / 在途复用）。
 */

const ok = (stdout: string): GitExecResult => ({ code: 0, stdout, stderr: '', error: null });
const fail = (stderr: string, code = 128): GitExecResult => ({ code, stdout: '', stderr, error: null });

/** 按参数首词分发的 fake 执行器。 */
function fakeGit(handlers: Record<string, GitExecResult | ((args: readonly string[]) => GitExecResult)>): { run: GitExec; calls: string[][] } {
  const calls: string[][] = [];
  const run: GitExec = (args) => {
    calls.push([...args]);
    const head = args[0] ?? '';
    const hit = handlers[head];
    if (hit === undefined) return Promise.resolve(fail(`unknown command: ${head}`));
    return Promise.resolve(typeof hit === 'function' ? hit(args) : hit);
  };
  return { run, calls };
}

describe('parseStatusPorcelain', () => {
  test('五种 kind 归一（XY 状态字 → modified/added/deleted/renamed/untracked）', () => {
    expect(parseStatusPorcelain([' M a.ts', 'M  b.ts', 'A  c.ts', ' D d.ts', 'D  e.ts', 'R  old.ts -> new.ts', '?? u.ts'].join('\n'))).toEqual([
      { path: 'a.ts', kind: 'modified', additions: 0, deletions: 0 },
      { path: 'b.ts', kind: 'modified', additions: 0, deletions: 0 },
      { path: 'c.ts', kind: 'added', additions: 0, deletions: 0 },
      { path: 'd.ts', kind: 'deleted', additions: 0, deletions: 0 },
      { path: 'e.ts', kind: 'deleted', additions: 0, deletions: 0 },
      { path: 'new.ts', kind: 'renamed', additions: 0, deletions: 0 },
      { path: 'u.ts', kind: 'untracked', additions: 0, deletions: 0 },
    ]);
  });

  test('引号路径剥离、空行/垃圾行跳过', () => {
    expect(parseStatusPorcelain([' M "空 格.ts"', '', '  ', 'xx'].join('\n'))).toEqual([
      { path: '空 格.ts', kind: 'modified', additions: 0, deletions: 0 },
    ]);
    expect(parseStatusLine('')).toBeNull();
    expect(parseStatusPorcelain('')).toEqual([]);
  });

  test('冲突态（UU/DD）落 modified/deleted（merge 细节不处理，计数照实）', () => {
    expect(parseStatusPorcelain('UU c.ts\nDD g.ts').map((file) => file.kind)).toEqual(['modified', 'deleted']);
  });
});

describe('parseNumstat', () => {
  test('普通行 + 二进制 `-` 行 + rename 形态', () => {
    const totals = parseNumstat(['3\t1\ta.ts', '-\t-\timg.png', '2\t0\told.ts => new.ts', '1\t4\t{a/x.ts => b/y.ts}'].join('\n'));
    expect(totals.get('a.ts')).toEqual({ additions: 3, deletions: 1 });
    expect(totals.get('img.png')).toEqual({ additions: 0, deletions: 0 });
    expect(totals.get('new.ts')).toEqual({ additions: 2, deletions: 0 });
    expect(totals.get('b/y.ts')).toEqual({ additions: 1, deletions: 4 });
  });

  test('同 path 多段累加；垃圾行/负数按 0 降级', () => {
    const totals = parseNumstat(['1\t1\ta.ts', '2\t3\ta.ts', 'x\ty\tb.ts', '-5\t-5\tc.ts', 'junk'].join('\n'));
    expect(totals.get('a.ts')).toEqual({ additions: 3, deletions: 4 });
    expect(totals.get('b.ts')).toEqual({ additions: 0, deletions: 0 });
    expect(totals.get('c.ts')).toEqual({ additions: 0, deletions: 0 });
  });

  test('parseNumstatLine 字段不足 → null', () => {
    expect(parseNumstatLine('1\t2')).toBeNull();
  });
});

describe('parseRevListCount', () => {
  test.each([
    ['2\t3', { ahead: 2, behind: 3 }],
    ['0\t0', { ahead: 0, behind: 0 }],
    ['-1\t3', { ahead: 0, behind: 3 }],
    ['垃圾', null],
    ['5', null],
    ['', null],
  ])('%s → %j', (stdout: string, expected: { ahead: number; behind: number } | null) => {
    expect(parseRevListCount(stdout)).toEqual(expected);
  });
});

describe('createGitStatus · 行为', () => {
  test('非仓库 → 空形态（不报错）', async () => {
    const { run } = fakeGit({ 'rev-parse': fail('fatal: not a git repository (or any of the parent directories): .git') });
    const outcome = await createGitStatus(run).status('/x');
    expect(outcome).toEqual({
      ok: true,
      data: { isRepo: false, current: null, files: [], fileCount: 0, truncated: false, additions: 0, deletions: 0, ahead: 0, behind: 0 },
    });
  });

  test('全量读：文件行数合并 numstat、上游计数、文件数全量', async () => {
    const { run, calls } = fakeGit({
      'rev-parse': (args) => (args.includes('--verify') ? ok('abc123') : ok('.git')),
      'symbolic-ref': ok('feat/x'),
      status: ok(' M a.ts\n?? u.ts'),
      diff: ok('7\t2\ta.ts'),
      'rev-list': ok('2\t1'),
    });
    const outcome = await createGitStatus(run).status('/x');
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.data).toEqual({
      isRepo: true,
      current: 'feat/x',
      files: [
        { path: 'a.ts', kind: 'modified', additions: 7, deletions: 2 },
        { path: 'u.ts', kind: 'untracked', additions: 0, deletions: 0 },
      ],
      fileCount: 2,
      truncated: false,
      additions: 7,
      deletions: 2,
      ahead: 2,
      behind: 1,
    });
    // 顺序：仓库探测 → HEAD 分支 → porcelain → HEAD 存在性 → numstat → 上游
    expect(calls.map((args) => args[0])).toEqual(['rev-parse', 'symbolic-ref', 'status', 'rev-parse', 'diff', 'rev-list']);
  });

  test('空仓库（unborn HEAD）：diff 不跑、计数降级 0，untracked 照常', async () => {
    const { run, calls } = fakeGit({
      'rev-parse': (args) => (args.includes('--verify') ? fail('fatal: Needed a single revision') : ok('.git')),
      'symbolic-ref': ok('main'),
      status: ok('?? readme.md'),
      diff: ok(''),
      'rev-list': fail('fatal: no upstream'),
    });
    const outcome = await createGitStatus(run).status('/x');
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.data.additions).toBe(0);
    expect(outcome.data.deletions).toBe(0);
    expect(outcome.data.ahead).toBe(0);
    expect(outcome.data.behind).toBe(0);
    expect(outcome.data.files).toEqual([{ path: 'readme.md', kind: 'untracked', additions: 0, deletions: 0 }]);
    expect(calls.some((args) => args[0] === 'diff')).toBe(false);
  });

  test('detached HEAD（symbolic-ref 非零）：current=null，上游降级 0', async () => {
    const { run } = fakeGit({
      'rev-parse': (args) => (args.includes('--verify') ? ok('abc') : ok('.git')),
      'symbolic-ref': fail('', 1),
      status: ok(''),
      diff: ok(''),
      'rev-list': fail('fatal: no upstream'),
    });
    const outcome = await createGitStatus(run).status('/x');
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.data.current).toBeNull();
  });

  test('files 超上限截断展示、计数全量', async () => {
    const lines = Array.from({ length: STATUS_FILES_LIMIT + 5 }, (_v, index) => ` M f${index}.ts`).join('\n');
    const { run } = fakeGit({
      'rev-parse': (args) => (args.includes('--verify') ? ok('abc') : ok('.git')),
      'symbolic-ref': ok('main'),
      status: ok(lines),
      diff: ok(''),
      'rev-list': fail(''),
    });
    const outcome = await createGitStatus(run).status('/x');
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.data.files.length).toBe(STATUS_FILES_LIMIT);
    expect(outcome.data.fileCount).toBe(STATUS_FILES_LIMIT + 5);
    expect(outcome.data.truncated).toBe(true);
  });

  test('执行器进程级异常 → 失败透传（不吞错）', async () => {
    const timeout: GitExecResult = { code: null, stdout: '', stderr: '', error: 'timeout' };
    const { run } = fakeGit({ 'rev-parse': timeout });
    const outcome: Awaited<ReturnType<GitStatus['status']>> = await createGitStatus(run).status('/x');
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error).toEqual({ kind: 'transient', face: 'timeout', message: 'git_failed:timeout' });
  });

  test('同 cwd 在途复用（并发两次 = 一次执行）', async () => {
    const { run, calls } = fakeGit({
      'rev-parse': ok('.git'),
      'symbolic-ref': ok('main'),
      status: ok(''),
      diff: ok(''),
      'rev-list': fail(''),
    });
    const status: GitStatus = createGitStatus(run);
    const [first, second] = await Promise.all([status.status('/x'), status.status('/x')]);
    expect(first).toEqual(second);
    expect(calls.filter((args) => args[0] === 'status').length).toBe(1);
  });

  test('症状回归「checkout 后在途复用回吐切换前快照」：invalidate 后新调用重读', async () => {
    const { run, calls } = fakeGit({
      'rev-parse': ok('.git'),
      'symbolic-ref': ok('main'),
      status: ok(''),
      diff: ok(''),
      'rev-list': fail(''),
    });
    const status: GitStatus = createGitStatus(run);
    const first = status.status('/x');
    status.invalidate('/x');
    const second = status.status('/x');
    await Promise.all([first, second]);
    expect(calls.filter((args) => args[0] === 'status').length).toBe(2);
  });
});
