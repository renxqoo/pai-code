import { describe, expect, test } from 'bun:test';

import { createGitGraph, parseGraphLog } from '../git-graph';
import type { GitExec, GitExecResult } from '../git-branches';

/**
 * git 图谱读口（T36）：纯函数解析（NUL/记录分隔/装饰/parents）+ fake 执行器驱动的
 * 行为（非仓库/空仓库降级、上限截断、单飞与失效、进程级异常 error）。
 */

const ok = (stdout: string): GitExecResult => ({ code: 0, stdout, stderr: '', error: null });
const fail = (stderr: string, code = 128): GitExecResult => ({ code, stdout: '', stderr, error: null });
const proc = (error: GitExecResult['error']): GitExecResult => ({ code: null, stdout: '', stderr: '', error });

const FIELD = '\0';
const RECORD = '\x1e';
const record = (hash: string, short: string, author: string, at: string, subject: string, decor: string, parents: string): string =>
  [hash, short, author, at, subject, decor, parents].join(FIELD);

describe('parseGraphLog', () => {
  test('attached HEAD：refs 含「HEAD -> main」且 isHead；merge 双 parents', () => {
    const stdout = [
      record('a7', 'a7f9c2a', 'pai', '1789157310', 'merge dev', 'HEAD -> main', 'b2 c3'),
      record('b2', 'b2d1e3f', 'pai', '1789157300', 'dev work', 'dev', 'c4'),
    ].join(RECORD);
    const commits = parseGraphLog(stdout);
    expect(commits.length).toBe(2);
    expect(commits[0]).toEqual({
      hash: 'a7',
      shortHash: 'a7f9c2a',
      author: 'pai',
      timestamp: 1789157310,
      subject: 'merge dev',
      parents: ['b2', 'c3'],
      refs: ['HEAD -> main'],
      isHead: true,
    });
    expect(commits[1]?.isHead).toBe(false);
    expect(commits[1]?.refs).toEqual(['dev']);
    expect(commits[1]?.parents).toEqual(['c4']);
  });

  test('负值时间戳（GIT_*_DATE 可造 1970 前时间）退化为 0，不产出违反契约的数据', () => {
    const commits = parseGraphLog(record('a7', 'a7f9c2a', 'pai', '-123', 's', '', ''));
    expect(commits[0]?.timestamp).toBe(0);
  });

  test('detached HEAD：%D 输出「HEAD, main」拆为两个 token，isHead 仍真', () => {
    const commits = parseGraphLog(record('a7', 'a7f9c2a', 'pai', '1', 'x', 'HEAD, main', ''));
    expect(commits[0]?.refs).toEqual(['HEAD', 'main']);
    expect(commits[0]?.isHead).toBe(true);
  });

  test('根提交（无 parents/无装饰）与多 ref 装饰', () => {
    const commits = parseGraphLog(record('c4', 'c4ab567', 'dev', '0', 'init', 'main, dev', ''));
    expect(commits[0]?.parents).toEqual([]);
    expect(commits[0]?.refs).toEqual(['main', 'dev']);
    expect(commits[0]?.timestamp).toBe(0);
  });

  test('畸形记录跳过（字段数不足/空哈希/空记录），时间戳垃圾退化为 0', () => {
    const stdout = [
      'only-three-fields',
      record('', 'short', 'a', '1', 's', '', ''),
      record('h', '', 'a', '1', 's', '', ''),
      RECORD,
      record('ok1', 'ok1abcd', 'a', 'not-a-number', 's', '', ''),
    ].join(RECORD);
    const commits = parseGraphLog(stdout);
    expect(commits.length).toBe(1);
    expect(commits[0]?.hash).toBe('ok1');
    expect(commits[0]?.timestamp).toBe(0);
  });
});

describe('createGitGraph', () => {
  const head = record('a7', 'a7f9c2a', 'pai', '1789157310', 'c1', 'HEAD -> main', '');

  test('非仓库 → 空形态；空仓库（HEAD 无可解析，stderr 为本地化文案也能判定）→ 空列表', async () => {
    const plain = createGitGraph((args) => Promise.resolve(args[0] === 'rev-parse' ? fail('fatal: not a git repository') : ok('')));
    expect(await plain.list('/w/plain')).toEqual({ ok: true, data: { isRepo: false, commits: [], truncated: false } });

    const empty = createGitGraph((args) => {
      if (args[0] === 'log') return Promise.resolve(fail('fatal：当前分支还没有任何提交（非英文 locale 文案）'));
      if (args.includes('--verify')) return Promise.resolve(fail('', 1));
      return Promise.resolve(ok('.git'));
    });
    expect(await empty.list('/w/repo')).toEqual({ ok: true, data: { isRepo: true, commits: [], truncated: false } });

    // log 失败但 HEAD 存在（非空仓库的真实故障）：照实透传，不误判成空仓库
    const broken = createGitGraph((args) => {
      if (args[0] === 'log') return Promise.resolve(fail('fatal: bad object HEAD'));
      if (args.includes('--verify')) return Promise.resolve(ok('a7f9c2a'));
      return Promise.resolve(ok('.git'));
    });
    expect(await broken.list('/w/repo')).toEqual({ ok: false, error: { kind: 'internal_error', message: 'git_failed:fatal: bad object HEAD' } });
  });

  test('正常仓库解析 + 上限 500 截断（多取 1 条判 truncated）', async () => {
    const many = Array.from({ length: 501 }, (_, i) => record(`h${i}`, `s${i}`, 'a', '1', `c${i}`, '', i === 0 ? '' : `h${i - 1}`)).join(RECORD);
    const git = createGitGraph((args) =>
      Promise.resolve(args[0] === 'rev-parse' ? ok('.git') : args[0] === 'log' ? ok(many) : ok('')),
    );
    const outcome = await git.list('/w/repo');
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.data.commits.length).toBe(500);
    expect(outcome.data.truncated).toBe(true);
    expect(outcome.data.commits[0]?.hash).toBe('h0');

    const exact = createGitGraph((args) =>
      Promise.resolve(args[0] === 'rev-parse' ? ok('.git') : args[0] === 'log' ? ok(head) : ok('')),
    );
    const single = await exact.list('/w/repo');
    expect(single).toEqual({ ok: true, data: { isRepo: true, commits: [parseGraphLog(head)[0]], truncated: false } });
  });

  test('截断判定按原始记录数：501 条中混入畸形记录被 parse 跳过后，截断提示不丢失', async () => {
    const rows = Array.from({ length: 500 }, (_, i) => record(`h${i}`, `s${i}`, 'a', '1', `c${i}`, '', i === 0 ? '' : `h${i - 1}`));
    const withGarbage = [...rows.slice(0, 500), 'malformed-record'].join(RECORD);
    const git = createGitGraph((args) =>
      Promise.resolve(args[0] === 'rev-parse' ? ok('.git') : args[0] === 'log' ? ok(withGarbage) : ok('')),
    );
    const outcome = await git.list('/w/repo');
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.data.commits.length).toBe(500);
    expect(outcome.data.truncated).toBe(true);
  });

  test('进程级异常与探测失败 error 透传', async () => {
    const missing = createGitGraph((args) => Promise.resolve(args[0] === 'rev-parse' ? proc('spawn_failed') : ok('')));
    expect(await missing.list('/w/repo')).toEqual({ ok: false, error: { kind: 'git_unavailable' } });

    const timedOut = createGitGraph((args) => Promise.resolve(args[0] === 'rev-parse' ? ok('.git') : proc('timeout')));
    expect(await timedOut.list('/w/repo')).toEqual({ ok: false, error: { kind: 'transient', face: 'timeout', message: 'git_failed:timeout' } });

    const dubious = createGitGraph((args) =>
      Promise.resolve(args[0] === 'rev-parse' ? fail('fatal: detected dubious ownership in repository') : ok('')),
    );
    expect(await dubious.list('/w/repo')).toEqual({ ok: false, error: { kind: 'internal_error', message: 'git_failed:fatal: detected dubious ownership in repository' } });
  });

  test('同 cwd 在途单飞（只探测一次）', async () => {
    let probeCount = 0;
    let logCount = 0;
    const exec: GitExec = (args) => {
      if (args[0] === 'rev-parse') {
        probeCount += 1;
        return Promise.resolve(ok('.git'));
      }
      if (args[0] === 'log') {
        logCount += 1;
        return Promise.resolve(ok(head));
      }
      return Promise.resolve(ok(''));
    };
    const git = createGitGraph(exec);
    const [a, b] = await Promise.all([git.list('/w/repo'), git.list('/w/repo')]);
    expect(a).toEqual(b);
    expect(probeCount).toBe(1);
    expect(logCount).toBe(1);
  });

  test('invalidate 丢弃在途单飞：同 cwd 的下一次 list 不复用旧 promise', async () => {
    let probes = 0;
    const gates: Array<() => void> = [];
    const exec: GitExec = (args) => {
      if (args[0] === 'rev-parse') {
        probes += 1;
        return Promise.resolve(ok('.git'));
      }
      return new Promise<GitExecResult>((resolve) => {
        gates.push(() => resolve(ok(head)));
      });
    };
    const git = createGitGraph(exec);
    const first = git.list('/w/repo');
    const second = git.list('/w/repo');
    git.invalidate('/w/repo');
    const third = git.list('/w/repo');
    // first/second 共享一条在途 log；invalidate 后 third 自起一条新 log（probe 微任务结算后才入队）
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 0);
    });
    for (const release of gates.splice(0)) release();
    const results = await Promise.all([first, second, third]);
    expect(results[0]).toEqual(results[1]);
    expect(results[2]).toEqual(results[0]);
    expect(probes).toBe(2);
  });
});
