import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createApiRoutes } from '../api-routes';
import { createAgentDirFiles } from '../agent-dir-files';
import { createAgentDefinitionsStore } from '../agent-definitions-store';
import { createFileSettings, type ProviderKeyStore } from '../file-settings';
import { createPaiRuntime } from '../pai-runtime';
import type { GitBranches } from '../git-branches';
import type { GitGraph } from '../git-graph';

/**
 * git 路由面：cwd 白名单门禁 + git 能力注入透传 + 失败面 + audit；
 * 另有一组真 git 集成（隔离世界：临时仓库 + 真二进制 + 全真装配），
 * 断言业务终态（当前分支切换成功、脏工作区拒绝），不是「没崩」。
 */

const keyStore: ProviderKeyStore = {
  encryptionAvailable: false,
  getKey: () => null,
  setKey: () => undefined,
  keyNames: [],
};

function makeRoutes(work: string, git?: GitBranches, graph?: GitGraph) {
  const agentDir = join(work, 'agent');
  const project = join(work, 'project');
  mkdirSync(join(agentDir, 'sessions'), { recursive: true });
  mkdirSync(project, { recursive: true });
  const runtime = createPaiRuntime({
    paths: {
      userDataDir: work,
      agentDir,
      registryDb: join(work, 'r.sqlite'),
      settingsFile: join(work, 's.json'),
      providerKeysFile: join(work, 'k.json'),
      logFile: join(work, 'l.log'),
    },
    keyStore,
    providers: () => [],
    idleRecycleMinutes: () => 5,
    hubPaths: () => ({ bunPath: 'bun', hubEntry: '/nonexistent/cli.js' }),
    logger: { log: () => undefined },
    emit: () => undefined,
  });
  const audits: string[] = [];
  const routes = createApiRoutes({
    runtime,
    settings: createFileSettings(join(work, 'settings.json'), keyStore),
    keyStore,
    audit: (message) => audits.push(message),
    agentDirFiles: createAgentDirFiles(agentDir),
    agentDefinitions: createAgentDefinitionsStore(agentDir),
    revealPath: () => undefined,
    pickDirectory: () => Promise.resolve(null),
    // 本次运行白名单：系统选择器选过的目录（此处直接注入被测目录）
    extraCwds: () => [project],
    ...(git === undefined ? {} : { git }),
    ...(graph === undefined ? {} : { graph }),
  });
  return { routes, audits, project, outside: join(work, 'outside') };
}

/** 记录调用的 fake git：按分支名给结果。 */
function makeFakeGit(result: Awaited<ReturnType<GitBranches['list']>>, checkout: Awaited<ReturnType<GitBranches['checkout']>>) {
  const calls: string[] = [];
  const git: GitBranches = {
    list: (cwd) => {
      calls.push(`list:${cwd}`);
      return Promise.resolve(result);
    },
    checkout: (cwd, branch, create) => {
      calls.push(`checkout:${cwd}:${branch}:${String(create)}`);
      return Promise.resolve(checkout);
    },
  };
  return { git, calls };
}

/** 记录调用的 fake graph。 */
function makeFakeGraph(result: Awaited<ReturnType<GitGraph['list']>>) {
  const calls: string[] = [];
  const invalidations: string[] = [];
  const graph: GitGraph = {
    list: (cwd) => {
      calls.push(`graph:${cwd}`);
      return Promise.resolve(result);
    },
    invalidate: (cwd) => {
      invalidations.push(cwd);
    },
  };
  return { graph, calls, invalidations };
}

describe('git 路由（fake git 注入）', () => {
  test('git/branches 透传注入结果；audit 不记只读列表', async () => {
    const work = mkdtempSync(join(tmpdir(), 'pai-git-route-'));
    const { git, calls } = makeFakeGit({ ok: true, data: { isRepo: true, current: 'main', branches: ['dev', 'main'], dirtyFiles: 2 } }, { ok: true, data: { branch: 'dev' } });
    const { routes, project } = makeRoutes(work, git);
    expect(await routes.invoke('git/branches', { cwd: project })).toEqual({
      ok: true,
      data: { isRepo: true, current: 'main', branches: ['dev', 'main'], dirtyFiles: 2 },
    });
    expect(calls).toEqual([`list:${project}`]);
    rmSync(work, { recursive: true, force: true });
  });

  test('白名单外 cwd 一律 cwd_not_allowed（git 能力不被调用）', async () => {
    const work = mkdtempSync(join(tmpdir(), 'pai-git-route-'));
    const { git, calls } = makeFakeGit({ ok: true, data: { isRepo: false, current: null, branches: [], dirtyFiles: 0 } }, { ok: true, data: { branch: 'dev' } });
    const { graph, calls: graphCalls } = makeFakeGraph({ ok: true, data: { isRepo: true, commits: [], truncated: false } });
    const { routes, outside } = makeRoutes(work, git, graph);
    expect(await routes.invoke('git/branches', { cwd: outside })).toEqual({ ok: false, reason: 'cwd_not_allowed' });
    expect(await routes.invoke('git/checkout', { cwd: outside, branch: 'dev' })).toEqual({ ok: false, reason: 'cwd_not_allowed' });
    expect(await routes.invoke('git/graph', { cwd: outside })).toEqual({ ok: false, reason: 'cwd_not_allowed' });
    expect(calls).toEqual([]);
    expect(graphCalls).toEqual([]);
    rmSync(work, { recursive: true, force: true });
  });

  test('git/checkout 成功透传 branch 并记 audit；失败原因（脏工作区）原样透传', async () => {
    const work = mkdtempSync(join(tmpdir(), 'pai-git-route-'));
    const { git, calls } = makeFakeGit({ ok: true, data: { isRepo: true, current: 'main', branches: ['dev', 'main'], dirtyFiles: 0 } }, { ok: false, reason: 'dirty_worktree' });
    const { graph, invalidations } = makeFakeGraph({ ok: true, data: { isRepo: true, commits: [], truncated: false } });
    const { routes, audits, project } = makeRoutes(work, git, graph);
    expect(await routes.invoke('git/checkout', { cwd: project, branch: 'dev' })).toEqual({ ok: false, reason: 'dirty_worktree' });
    expect(calls).toEqual([`checkout:${project}:dev:false`]);
    expect(audits).toContain(`git_checkout:${project}:dev:switch`);
    // 失败不变更 HEAD：图谱缓存不失效
    expect(invalidations).toEqual([]);
    rmSync(work, { recursive: true, force: true });
  });

  test('create=true 透传并记 create audit；git 不可用透传 git_unavailable', async () => {
    const work = mkdtempSync(join(tmpdir(), 'pai-git-route-'));
    const { git, calls } = makeFakeGit({ ok: false, reason: 'git_unavailable' }, { ok: true, data: { branch: 'feat/x' } });
    const { routes, audits, project } = makeRoutes(work, git);
    expect(await routes.invoke('git/branches', { cwd: project })).toEqual({ ok: false, reason: 'git_unavailable' });
    expect(await routes.invoke('git/checkout', { cwd: project, branch: 'feat/x', create: true })).toEqual({
      ok: true,
      data: { branch: 'feat/x' },
    });
    expect(calls).toContain(`checkout:${project}:feat/x:true`);
    expect(audits).toContain(`git_checkout:${project}:feat/x:create`);
    rmSync(work, { recursive: true, force: true });
  });

  test('checkout 成功 → graph 缓存失效（HEAD 已改写，防复用切换前快照）', async () => {
    const work = mkdtempSync(join(tmpdir(), 'pai-git-route-'));
    const { git } = makeFakeGit({ ok: true, data: { isRepo: true, current: 'main', branches: ['dev', 'main'], dirtyFiles: 0 } }, { ok: true, data: { branch: 'dev' } });
    const { graph, calls, invalidations } = makeFakeGraph({ ok: true, data: { isRepo: true, commits: [], truncated: false } });
    const { routes, project } = makeRoutes(work, git, graph);
    await routes.invoke('git/graph', { cwd: project });
    await routes.invoke('git/checkout', { cwd: project, branch: 'dev' });
    expect(calls).toEqual([`graph:${project}`]);
    expect(invalidations).toEqual([project]);
    rmSync(work, { recursive: true, force: true });
  });

  test('未注入 git 时走真实能力：非仓库目录返回空形态（不报错）', async () => {
    const work = mkdtempSync(join(tmpdir(), 'pai-git-route-'));
    const { routes, project } = makeRoutes(work);
    expect(await routes.invoke('git/branches', { cwd: project })).toEqual({
      ok: true,
      data: { isRepo: false, current: null, branches: [], dirtyFiles: 0 },
    });
    rmSync(work, { recursive: true, force: true });
  });
});

describe('git 路由 × 真 git（隔离世界）', () => {
  const work = mkdtempSync(join(tmpdir(), 'pai-git-real-'));
  const repo = join(work, 'project');
  const outside = join(work, 'outside');
  let routes: ReturnType<typeof makeRoutes>['routes'];
  const git = (...args: string[]): void => {
    execFileSync('git', ['-c', 'user.email=pai@test', '-c', 'user.name=pai', ...args], { cwd: repo });
  };

  beforeAll(() => {
    mkdirSync(repo, { recursive: true });
    mkdirSync(outside, { recursive: true });
    git('init', '-b', 'main');
    writeFileSync(join(repo, 'tracked.txt'), 'one\n');
    git('add', '.');
    git('commit', '-m', 'init');
    git('branch', 'dev');
    routes = makeRoutes(work, undefined).routes;
  });

  afterAll(() => {
    rmSync(work, { recursive: true, force: true });
  });

  test('列表：当前分支 main + 分支集升序；非仓库目录空形态', async () => {
    expect(await routes.invoke('git/branches', { cwd: repo })).toEqual({
      ok: true,
      data: { isRepo: true, current: 'main', branches: ['dev', 'main'], dirtyFiles: 0 },
    });
    // outside 不在白名单 → 门禁先拦（这是安全面，不是 git 面）
    expect(await routes.invoke('git/branches', { cwd: outside })).toEqual({ ok: false, reason: 'cwd_not_allowed' });
  });

  test('切换成功：当前分支真变为 dev；创建并检出后新分支出现', async () => {
    expect(await routes.invoke('git/checkout', { cwd: repo, branch: 'dev' })).toEqual({ ok: true, data: { branch: 'dev' } });
    const after = await routes.invoke('git/branches', { cwd: repo });
    expect(after).toEqual({ ok: true, data: { isRepo: true, current: 'dev', branches: ['dev', 'main'], dirtyFiles: 0 } });

    expect(await routes.invoke('git/checkout', { cwd: repo, branch: 'feat/new', create: true })).toEqual({
      ok: true,
      data: { branch: 'feat/new' },
    });
    const created = await routes.invoke('git/branches', { cwd: repo });
    expect(created).toEqual({ ok: true, data: { isRepo: true, current: 'feat/new', branches: ['dev', 'feat/new', 'main'], dirtyFiles: 0 } });
    // 同名再创建 → branch_exists（不静默覆盖）
    expect(await routes.invoke('git/checkout', { cwd: repo, branch: 'feat/new', create: true })).toEqual({
      ok: false,
      reason: 'branch_exists',
    });
  });

  test('选项形 ref（`-f`/`--detach`）既不进列表也不可检出：拒绝后 HEAD 不被改变', async () => {
    // 这类 ref 只能用 update-ref 造出来（git 命令自带的参数解析会拒绝），
    // 但 for-each-ref 会列出它们——若不过滤/不拦，点选会变成 git 选项
    git('update-ref', 'refs/heads/-f', 'HEAD');
    git('update-ref', 'refs/heads/--detach', 'HEAD');
    const listed = await routes.invoke('git/branches', { cwd: repo });
    expect(listed.ok).toBe(true);
    if (listed.ok) {
      expect(listed.data.branches).not.toContain('-f');
      expect(listed.data.branches).not.toContain('--detach');
    }
    expect(await routes.invoke('git/checkout', { cwd: repo, branch: '--detach' })).toEqual({ ok: false, reason: 'invalid_branch' });
    expect(await routes.invoke('git/checkout', { cwd: repo, branch: '-f' })).toEqual({ ok: false, reason: 'invalid_branch' });
    expect(execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: repo }).toString().trim()).not.toBe('HEAD');
  });

  test('脏工作区拒绝切换：改动未被 checkout 丢掉（业务终态）', async () => {
    git('checkout', 'main');
    writeFileSync(join(repo, 'tracked.txt'), 'dirty\n');
    expect(await routes.invoke('git/checkout', { cwd: repo, branch: 'dev' })).toEqual({ ok: false, reason: 'dirty_worktree' });
    expect(execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: repo }).toString().trim()).toBe('main');
    // 收尾：恢复干净工作区（同一隔离世界内后续断言依赖）
    git('checkout', '--', 'tracked.txt');
  });

  test('图谱：merge 提交双 parents；HEAD 装饰与短哈希（业务终态）', async () => {
    git('checkout', 'dev');
    writeFileSync(join(repo, 'dev.txt'), 'dev\n');
    git('add', '.');
    git('commit', '-m', 'dev work');
    git('checkout', 'main');
    writeFileSync(join(repo, 'main.txt'), 'main\n');
    git('add', '.');
    git('commit', '-m', 'main work');
    git('merge', '--no-ff', '-m', 'merge dev', 'dev');

    const graph = await routes.invoke('git/graph', { cwd: repo });
    expect(graph.ok).toBe(true);
    if (!graph.ok) return;
    expect(graph.data.isRepo).toBe(true);
    expect(graph.data.truncated).toBe(false);
    expect(graph.data.commits.length).toBe(4);
    const head = graph.data.commits[0];
    expect(head?.isHead).toBe(true);
    expect(head?.refs).toContain('HEAD -> main');
    expect(head?.parents.length).toBe(2);
    expect(head?.subject).toBe('merge dev');
    expect(head?.shortHash.length).toBe(7);
    const root = graph.data.commits[3];
    expect(root?.parents).toEqual([]);
    expect(graph.data.commits.some((commit) => commit.subject === 'dev work')).toBe(true);
  });

  test('图谱：空仓库 → 空列表（isRepo=true，不报错）', async () => {
    const emptyWork = mkdtempSync(join(tmpdir(), 'pai-git-empty-'));
    const emptyRepo = join(emptyWork, 'project');
    mkdirSync(emptyRepo, { recursive: true });
    execFileSync('git', ['init', '-b', 'main'], { cwd: emptyRepo });
    const { routes: emptyRoutes } = makeRoutes(emptyWork);
    expect(await emptyRoutes.invoke('git/graph', { cwd: emptyRepo })).toEqual({
      ok: true,
      data: { isRepo: true, commits: [], truncated: false },
    });
    rmSync(emptyWork, { recursive: true, force: true });
  });
});
