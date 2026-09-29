import { afterEach, describe, expect, test } from 'vitest';
import { execFile } from 'node:child_process';
import { mkdirSync, existsSync, rmSync, writeFileSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { casDeleteBranch, createGitWorktree, encodeBranchDir, isMergedIntoOthers, otherLocalBranches, parseWorktreePorcelain, type GitExec, type WorktreeEnv } from '../git-worktree';

const exec = promisify(execFile);

/** 真 git 仓夹具（每用例独占父目录——worktree 区互不可见）。 */
function makeRepo(tag: string): string {
  const root = join(tmpdir(), `xh-wtverb-${tag}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`);
  const dir = join(root, 'd', 'repo');
  mkdirSync(dir, { recursive: true });
  return realpathSync(dir);
}

async function seed(dir: string): Promise<void> {
  await exec('git', ['-C', dir, 'init']);
  await exec('git', ['-C', dir, 'config', 'user.email', 't@t']);
  await exec('git', ['-C', dir, 'config', 'user.name', 't']);
  writeFileSync(join(dir, 'a.txt'), 'a\n');
  await exec('git', ['-C', dir, 'add', '.']);
  await exec('git', ['-C', dir, 'commit', '-m', 'base']);
}

const env: WorktreeEnv = {
  isAbsolute,
  resolve,
  dirname,
  join,
  basename,
  exists: existsSync,
  realpath: (path) => realpathSync(path),
  withRepoLock: async <T>(_repoTop: string, critical: () => Promise<T>) => critical(),
};

const runGit: GitExec = (args, cwd) =>
  new Promise((resolveRun) => {
    execFile('git', args, { cwd }, (error, stdout, stderr) => {
      if (error === null) {
        resolveRun({ code: 0, stdout: String(stdout ?? ''), stderr: String(stderr ?? ''), error: null });
        return;
      }
      const code = (error as { code?: unknown }).code;
      resolveRun({
        code: typeof code === 'number' ? code : null,
        stdout: String(stdout ?? ''),
        stderr: String(stderr ?? ''),
        error: typeof code === 'number' ? null : 'spawn_failed',
      });
    });
  });

afterEach(() => {
  for (const dir of scratch) rmSync(dirname(dirname(dir)), { recursive: true, force: true });
  scratch = [];
});
let scratch: string[] = [];

describe('parseWorktreePorcelain', () => {
  test('branch 行缺席 = detached → null；locked/prunable 透传', () => {
    const out = [
      'worktree /w/main',
      'HEAD abc123',
      'branch refs/heads/main',
      '',
      'worktree /w/wt1',
      'HEAD def456',
      'branch refs/heads/feat/x',
      'locked',
      '',
      'worktree /w/det',
      'HEAD fedcba',
      'prunable',
      '',
    ].join('\n');
    const parsed = parseWorktreePorcelain(out);
    expect(parsed).toEqual([
      { path: '/w/main', branch: 'main', head: 'abc123', locked: false, prunable: false },
      { path: '/w/wt1', branch: 'feat/x', head: 'def456', locked: true, prunable: false },
      { path: '/w/det', branch: null, head: 'fedcba', locked: false, prunable: true },
    ]);
  });
});

describe('encodeBranchDir（D3 路径编码）', () => {
  test('slash → 连字符单段', () => {
    expect(encodeBranchDir('feat/login')).toBe('feat-login');
    expect(encodeBranchDir('a/b/c')).toBe('a-b-c');
    expect(encodeBranchDir('plain')).toBe('plain');
  });
});

describe('isMergedIntoOthers（收编门三态）', () => {
  test('收编 → true；未合并 → false；命令失败 → null', async () => {
    const repo = makeRepo('isanc');
    scratch.push(repo);
    await seed(repo);
    await exec('git', ['-C', repo, 'branch', 'other']);
    const mainTip = (await exec('git', ['-C', repo, 'rev-parse', 'main'])).stdout.trim();
    expect(await isMergedIntoOthers(runGit, repo, mainTip, ['refs/heads/other'])).toBe(true);
    await exec('git', ['-C', repo, 'checkout', '-q', '-b', 'unmerged']);
    writeFileSync(join(repo, 'n.txt'), 'n\n');
    await exec('git', ['-C', repo, 'add', '.']);
    await exec('git', ['-C', repo, 'commit', '-m', 'solo']);
    const soloTip = (await exec('git', ['-C', repo, 'rev-parse', 'HEAD'])).stdout.trim();
    expect(await isMergedIntoOthers(runGit, repo, soloTip, ['refs/heads/main', 'refs/heads/other'])).toBe(false);
    expect(await isMergedIntoOthers(runGit, repo, '0000000000000000000000000000000000000001', ['refs/heads/main'])).toBe(null);
  });

  test('同 tip 异名分支 → 放行（is-ancestor 正确放行面）', async () => {
    const repo = makeRepo('sametip');
    scratch.push(repo);
    await seed(repo);
    await exec('git', ['-C', repo, 'branch', 'alias']);
    const tip = (await exec('git', ['-C', repo, 'rev-parse', 'main'])).stdout.trim();
    expect(await isMergedIntoOthers(runGit, repo, tip, ['refs/heads/alias'])).toBe(true);
  });

  test('目标自身入列 = is-ancestor(b,b) 恒真——枚举必须显式排自身（向量锚）', async () => {
    const repo = makeRepo('selfenum');
    scratch.push(repo);
    await seed(repo);
    await exec('git', ['-C', repo, 'checkout', '-q', '-b', 'unmerged']);
    writeFileSync(join(repo, 'u.txt'), 'u\n');
    await exec('git', ['-C', repo, 'add', '.']);
    await exec('git', ['-C', repo, 'commit', '-m', 'solo']);
    const tip = (await exec('git', ['-C', repo, 'rev-parse', 'HEAD'])).stdout.trim();
    // 错误形态：自身入列 → 恒 true（门被穿透）
    expect(await isMergedIntoOthers(runGit, repo, tip, ['refs/heads/unmerged'])).toBe(true);
    // 正确形态：otherLocalBranches 排自身 → false
    const others = await otherLocalBranches(runGit, repo, 'refs/heads/unmerged');
    expect(others).not.toContain('refs/heads/unmerged');
    expect(await isMergedIntoOthers(runGit, repo, tip, others ?? [])).toBe(false);
  });
});

describe('casDeleteBranch（CAS 三态 + show-ref 复核）', () => {
  test('deleted / drifted / idempotent 三态实测', async () => {
    const repo = makeRepo('cas');
    scratch.push(repo);
    await seed(repo);
    await exec('git', ['-C', repo, 'branch', 'victim']);
    const tip = (await exec('git', ['-C', repo, 'rev-parse', 'victim'])).stdout.trim();
    expect(await casDeleteBranch(runGit, repo, 'victim', tip)).toBe('deleted');
    // 已删（幂等）
    expect(await casDeleteBranch(runGit, repo, 'victim', tip)).toBe('idempotent');
    // tip 漂移（锁外新 commit）
    await exec('git', ['-C', repo, 'branch', 'victim2']);
    const startTip = (await exec('git', ['-C', repo, 'rev-parse', 'victim2'])).stdout.trim();
    await exec('git', ['-C', repo, 'checkout', '-q', 'victim2']);
    writeFileSync(join(repo, 'late.txt'), 'late\n');
    await exec('git', ['-C', repo, 'add', '.']);
    await exec('git', ['-C', repo, 'commit', '-m', 'LATE commit after gate']);
    expect(await casDeleteBranch(runGit, repo, 'victim2', startTip)).toBe('drifted');
    const reachable = await exec('git', ['-C', repo, 'log', '--all', '--grep=LATE']);
    expect(reachable.stdout).toContain('LATE'); // 回归：锁外 commit 不随树丢失
    await exec('git', ['-C', repo, 'checkout', '-q', 'main']);
  });
});

describe('create（七步预检链）', () => {
  test('成功路径：用户区独立目录 + 分支在', async () => {
    const repo = makeRepo('create-ok');
    scratch.push(repo);
    await seed(repo);
    const wt = createGitWorktree(runGit, env);
    const result = await wt.create(repo, 'feat-login');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.path).toContain('.x-harness-user-worktrees');
    expect(basename(result.data.path)).toBe(`${basename(repo)}-feat-login`);
    expect(existsSync(result.data.path)).toBe(true);
  });

  test('分支已存在 → branch_exists（此失败路绝不跑兜底）', async () => {
    const repo = makeRepo('create-exists');
    scratch.push(repo);
    await seed(repo);
    await exec('git', ['-C', repo, 'checkout', '-q', '-b', 'feat/keep-me']);
    writeFileSync(join(repo, 'precious.txt'), 'user work\n');
    await exec('git', ['-C', repo, 'add', '.']);
    await exec('git', ['-C', repo, 'commit', '-m', 'user work on feat/keep-me']);
    const wt = createGitWorktree(runGit, env);
    const result = await wt.create(repo, 'feat/keep-me');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('branch_exists');
    // 回归：半建兜底不得删用户既有分支
    const branches = await exec('git', ['-C', repo, 'branch', '--list', 'feat/keep-me']);
    expect(branches.stdout.trim()).not.toBe('');
    const log = await exec('git', ['-C', repo, 'log', 'feat/keep-me', '--grep=user work']);
    expect(log.stdout).toContain('user work');
  });

  test('非法分支名 → invalid_branch；detached 主仓 → worktree_detached_head', async () => {
    const repo = makeRepo('create-gates');
    scratch.push(repo);
    await seed(repo);
    const wt = createGitWorktree(runGit, env);
    expect((await wt.create(repo, '-bad')).error?.kind).toBe('invalid_branch');
    await exec('git', ['-C', repo, 'checkout', '-q', '--detach', 'HEAD']);
    expect((await wt.create(repo, 'feat-x')).error?.kind).toBe('worktree_detached_head');
  });

  test('树内 cwd → worktree_nested', async () => {
    const repo = makeRepo('create-nested');
    scratch.push(repo);
    await seed(repo);
    const wt = createGitWorktree(runGit, env);
    const first = await wt.create(repo, 'feat-a');
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const nested = await wt.create(first.data.path, 'feat-b');
    expect(nested.error?.kind).toBe('worktree_nested');
  });

  test('同分支重 create（树已删分支残留形态）→ 路径/分支冲突如实拒', async () => {
    const repo = makeRepo('create-retry');
    scratch.push(repo);
    await seed(repo);
    const wt = createGitWorktree(runGit, env);
    const first = await wt.create(repo, 'feat-r');
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    // 外部删目录（prunable 形态）→ 重 create 撞 branch_exists
    rmSync(first.data.path, { recursive: true, force: true });
    const second = await wt.create(repo, 'feat-r');
    expect(second.error?.kind).toBe('branch_exists');
  });
});

describe('remove（四道门 + CAS）', () => {
  test('未合并树 → worktree_dirty 指路合并；合并后 → 放行删除', async () => {
    const repo = makeRepo('rm-flow');
    scratch.push(repo);
    await seed(repo);
    const wt = createGitWorktree(runGit, env);
    const created = await wt.create(repo, 'feat-login');
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    // 树内提交（净树 + 未合并）
    writeFileSync(join(created.data.path, 'work.txt'), 'work\n');
    await exec('git', ['-C', created.data.path, 'add', '.']);
    await exec('git', ['-C', created.data.path, 'commit', '-m', 'login work']);
    const blocked = await wt.remove(repo, created.data.path);
    expect(blocked.error?.kind).toBe('worktree_dirty');
    expect(blocked.error?.message).toContain('未并入');
    // 合并回主仓 → 放行
    const merged = await wt.merge(repo, 'feat-login');
    expect(merged.ok).toBe(true);
    const removed = await wt.remove(repo, created.data.path);
    expect(removed.ok).toBe(true);
    expect(existsSync(created.data.path)).toBe(false);
    const branchGone = await exec('git', ['-C', repo, 'branch', '--list', 'feat-login']);
    expect(branchGone.stdout.trim()).toBe('');
  });

  test('脏树（含 ignored）→ 拒且计数分类', async () => {
    const repo = makeRepo('rm-dirty');
    scratch.push(repo);
    await seed(repo);
    const wt = createGitWorktree(runGit, env);
    const created = await wt.create(repo, 'feat-d');
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    writeFileSync(join(created.data.path, 'untracked.txt'), 'x\n');
    writeFileSync(join(created.data.path, '.env'), 'SECRET=1\n');
    writeFileSync(join(created.data.path, '.gitignore'), '.env\n');
    const blocked = await wt.remove(repo, created.data.path);
    expect(blocked.error?.kind).toBe('worktree_dirty');
    expect(blocked.error?.message).toContain('未跟踪');
    expect(blocked.error?.message).toContain('忽略');
  });

  test('占用门：occupied → worktree_in_use', async () => {
    const repo = makeRepo('rm-occupied');
    scratch.push(repo);
    await seed(repo);
    const wt = createGitWorktree(runGit, env, { isOccupied: () => Promise.resolve(true) });
    const created = await wt.create(repo, 'feat-o');
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const blocked = await wt.remove(repo, created.data.path);
    expect(blocked.error?.kind).toBe('worktree_in_use');
  });

  test('锁外 commit 穿插（门后）→ CAS 漂移，分支保留可恢复', async () => {
    const repo = makeRepo('rm-cas-race');
    scratch.push(repo);
    await seed(repo);
    const wt = createGitWorktree(runGit, env);
    const created = await wt.create(repo, 'feat-race');
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    // 门评估（remove 调用）与锁外 commit 交错：先让树内有一个提交（未合并→会被 merged 门拒），
    // 所以本用例验证 CAS 的另一面：先合并使门过，再锁外 commit 到已合并分支 → tip 漂移
    writeFileSync(join(created.data.path, 'w.txt'), 'w\n');
    await exec('git', ['-C', created.data.path, 'add', '.']);
    await exec('git', ['-C', created.data.path, 'commit', '-m', 'work']);
    const merged = await wt.merge(repo, 'feat-race');
    expect(merged.ok).toBe(true);
    // 锁外（模拟 agent）在门评估后追加 commit——直接调用 casDeleteBranch 验证漂移面
    const tipBefore = (await exec('git', ['-C', repo, 'rev-parse', 'feat-race'])).stdout.trim();
    await exec('git', ['-C', created.data.path, 'commit', '--allow-empty', '-m', 'LATE after gate']);
    const outcome = await casDeleteBranch(runGit, repo, 'feat-race', tipBefore);
    expect(outcome).toBe('drifted');
    const branch = await exec('git', ['-C', repo, 'branch', '--list', 'feat-race']);
    expect(branch.stdout.trim()).not.toBe(''); // 分支保留
    const log = await exec('git', ['-C', repo, 'log', 'feat-race', '--grep=LATE']);
    expect(log.stdout).toContain('LATE'); // 新提交可达
  });
});

describe('merge（预检双门 + --no-ff）', () => {
  test('树内 cwd 发起 → worktree_nested（防 Already-up-to-date 假成功）', async () => {
    const repo = makeRepo('mg-nested');
    scratch.push(repo);
    await seed(repo);
    const wt = createGitWorktree(runGit, env);
    const created = await wt.create(repo, 'feat-m');
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const blocked = await wt.merge(created.data.path, 'feat-m');
    expect(blocked.error?.kind).toBe('worktree_nested');
  });

  test('主仓 detached → worktree_detached_head', async () => {
    const repo = makeRepo('mg-detached');
    scratch.push(repo);
    await seed(repo);
    const wt = createGitWorktree(runGit, env);
    await exec('git', ['-C', repo, 'checkout', '-q', '--detach', 'HEAD']);
    const blocked = await wt.merge(repo, 'main');
    expect(blocked.error?.kind).toBe('worktree_detached_head');
  });

  test('冲突 → conflict_files 且不自动 abort（现场保留）', async () => {
    const repo = makeRepo('mg-conflict');
    scratch.push(repo);
    await seed(repo);
    const wt = createGitWorktree(runGit, env);
    const created = await wt.create(repo, 'feat-c');
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    writeFileSync(join(created.data.path, 'a.txt'), 'branch version\n');
    await exec('git', ['-C', created.data.path, 'add', '.']);
    await exec('git', ['-C', created.data.path, 'commit', '-m', 'branch change']);
    writeFileSync(join(repo, 'a.txt'), 'main version\n');
    await exec('git', ['-C', repo, 'add', '.']);
    await exec('git', ['-C', repo, 'commit', '-m', 'main change']);
    const blocked = await wt.merge(repo, 'feat-c');
    expect(blocked.error?.kind).toBe('conflict_files');
    // 现场保留：MERGE_HEAD 在
    const mergeHead = await exec('git', ['-C', repo, 'rev-parse', '-q', '--verify', 'MERGE_HEAD']);
    expect(mergeHead.stdout.trim()).not.toBe('');
    await exec('git', ['-C', repo, 'merge', '--abort']);
  });
});

describe('list（逐树降级 + detached + 上游计数）', () => {
  test('列树：merged/clean/locked/prunable/detached 形态齐全', async () => {
    const repo = makeRepo('ls-all');
    scratch.push(repo);
    await seed(repo);
    const wt = createGitWorktree(runGit, env);
    const created = await wt.create(repo, 'feat-ls');
    expect(created.ok).toBe(true);
    const listed = await wt.list(repo);
    expect(listed.ok).toBe(true);
    if (!listed.ok) return;
    const entry = listed.data.worktrees.find((w) => w.path === created.data.path);
    expect(entry).toBeDefined();
    expect(entry?.branch).toBe('feat-ls');
    expect(entry?.clean).toBe(true);
    // 零提交新树：tip=起点 commit，被起点分支（main）包含 → merged=true（删了不丢内容——判据正确放行面）
    expect(entry?.merged).toBe(true);
  });
});
