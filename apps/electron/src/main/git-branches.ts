import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';

import type { GitBranchesView } from '@paiapp/contracts';
import { appError, type ApiError } from '@paiapp/api';

/**
 * 本地 git 分支能力（新建任务页项目/分支选择）：只读分支列表 + 切换/创建并检出。
 * git 子进程不经 shell（参数原样传递），带超时与输出上限；同 cwd 的列表请求在途复用，
 * checkout 全局串行（工作树是独占资源，宁可跨仓库过度串行也不并发写）。
 */

/** 进程级异常（超时杀进程 / 输出超限 / 启动失败 / 工作目录不存在）；正常退出与非零退出均为 null。 */
export type GitExecError = 'timeout' | 'output_too_large' | 'spawn_failed' | 'cwd_missing';

/** git 执行结果；code=null 表示进程未能正常退出（配合 error 判定原因）。 */
export type GitExecResult = {
  code: number | null
  stdout: string
  stderr: string
  error: GitExecError | null
}

export type GitExec = (args: readonly string[], cwd: string) => Promise<GitExecResult>

export type GitBranchesOutcome = { ok: true; data: GitBranchesView } | { ok: false; error: ApiError }
export type GitCheckoutOutcome = { ok: true; data: { branch: string } } | { ok: false; error: ApiError }

const GIT_TIMEOUT_MS = 5000;
/** 单条命令输出上限（分支列表/状态在正常仓库远小于此）。 */
const GIT_MAX_BUFFER = 1 << 20;
/** 错误摘要长度上限（透传给渲染层的 message 不做无界透传）。 */
const ERROR_SUMMARY_LIMIT = 200;
/**
 * 隔离仓库自带的可执行面：仓库本地 config 的 hooks 与 fsmonitor 都指向可执行文件，
 * 克隆来的恶意仓库能让「切分支」在 main 进程全权限下执行任意代码（绕开 hub 沙箱）。
 * -c 必须位于子命令之前；core.hooksPath 指向不存在的目录即等于无 hook。
 */
const GIT_ISOLATION_ARGS: readonly string[] = ['-c', 'core.hooksPath=/dev/null', '-c', 'core.fsmonitor=false'];

const okBranches = (data: GitBranchesView): GitBranchesOutcome => ({ ok: true, data });

/** 子进程 error 对象 → 进程级异常分类（纯函数，供单测钉住平台语义）。 */
export function classifyGitExecError(error: { code?: unknown; killed?: unknown; signal?: unknown }): GitExecError | null {
  if (error.killed === true || (typeof error.signal === 'string' && error.signal.length > 0)) return 'timeout';
  if (error.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER') return 'output_too_large';
  if (typeof error.code === 'number') return null;
  return 'spawn_failed';
}

/** 默认执行器：execFile（无 shell）+ 超时 + 输出上限 + 仓库可执行面隔离。git 读口族共用。 */
export const runGit: GitExec = (args, cwd) =>
  new Promise((resolve) => {
    execFile(
      'git',
      [...GIT_ISOLATION_ARGS, ...args],
      { cwd, timeout: GIT_TIMEOUT_MS, maxBuffer: GIT_MAX_BUFFER, windowsHide: true },
      (error, stdout, stderr) => {
        if (error === null) {
          resolve({ code: 0, stdout: stdout ?? '', stderr: stderr ?? '', error: null });
          return;
        }
        const failure = error as { code?: unknown; killed?: unknown; signal?: unknown };
        const kind = classifyGitExecError(failure);
        resolve({
          code: typeof failure.code === 'number' ? failure.code : null,
          stdout: stdout ?? '',
          stderr: stderr ?? '',
          // spawn 失败且目录不存在：更可能是目录被删（不是 git 不在 PATH），区分开才不误报
          error: kind === 'spawn_failed' && !existsSync(cwd) ? 'cwd_missing' : kind,
        });
      },
    );
  });

/** 首行错误摘要（git 报错首行即原因，后续为提示）。 */
function firstLine(text: string): string {
  const line = text.split('\n').find((entry) => entry.trim().length > 0) ?? '';
  return line.trim().slice(0, ERROR_SUMMARY_LIMIT);
}

/**
 * 分支名合法性（git check-ref-format 的规则子集，先于 git 拦住选项形与非法字符）：
 * 拒绝 `-` 开头（会被 git 当选项解析）、控制字符、`~^:?*[\\ `、`..`、`@{`、
 * 空组件/点开头组件/`.lock` 结尾；create 与 switch 共用同一道闸。
 */
export function isValidBranchName(branch: string): boolean {
  if (branch.length === 0 || branch.startsWith('-')) return false;
  if (branch === 'HEAD') return false;
  if (branch.startsWith('/') || branch.endsWith('/') || branch.includes('//')) return false;
  if (branch.startsWith('.') || branch.endsWith('.') || branch.includes('..')) return false;
  if (branch === '@' || branch.includes('@{') || branch.endsWith('.lock')) return false;
  for (const char of branch) {
    const code = char.codePointAt(0) ?? 0;
    if (code <= 0x20 || code === 0x7f) return false;
    if ('~^:?*[\\'.includes(char)) return false;
  }
  return branch.split('/').every((part) => part.length > 0 && !part.startsWith('.') && !part.endsWith('.lock'));
}

/** `for-each-ref` 输出 → 分支名（去空行/去重/升序；非法名不呈现给用户）。 */
export function parseBranchList(stdout: string): string[] {
  const names = new Set<string>();
  for (const line of stdout.split('\n')) {
    const name = line.trim();
    if (name.length > 0 && isValidBranchName(name)) names.add(name);
  }
  return [...names].sort((a, b) => a.localeCompare(b));
}

/** `status --porcelain --untracked-files=no` 输出 → 未提交更改文件数（口径与切换守卫一致：展示的数字就是会阻止切换的数字）。 */
export function parseDirtyCount(stdout: string): number {
  return stdout.split('\n').filter((line) => line.trim().length > 0).length;
}

/** git 报错 → AppError（git 族闭集成员 1:1；未识别一律 internal_error 带
 *  `git_failed:<摘要>` message，不吞错）。 */
export function mapGitFailure(stderr: string): ApiError {
  const text = stderr.toLowerCase();
  if (text.includes('not a git repository')) return appError('not_a_repo');
  if (text.includes('already exists')) return appError('branch_exists');
  if (text.includes('did not match any file') || text.includes('unknown revision') || text.includes('did not match any known')) {
    return appError('unknown_branch');
  }
  if (text.includes('local changes') || text.includes('would be overwritten') || text.includes('please commit your changes')) {
    return appError('dirty_worktree');
  }
  const summary = firstLine(stderr);
  return appError('internal_error', summary.length > 0 ? `git_failed:${summary}` : 'git_failed:unknown');
}

/** 执行结果 → 失败 AppError：进程级异常优先于 stderr 分类（超时不是「git 不在 PATH」）。git 读口族共用。 */
export function failureError(result: GitExecResult): ApiError {
  if (result.error === 'timeout') return { kind: 'transient', face: 'timeout', message: 'git_failed:timeout' };
  if (result.error === 'output_too_large') return { kind: 'transient', face: 'command_failed', message: 'git_failed:output_too_large' };
  if (result.error === 'cwd_missing') return appError('cwd_not_found');
  if (result.error === 'spawn_failed') return appError('git_unavailable');
  return mapGitFailure(result.stderr);
}

export interface GitBranches {
  list: (cwd: string) => Promise<GitBranchesOutcome>
  checkout: (cwd: string, branch: string, create: boolean) => Promise<GitCheckoutOutcome>
}

export function createGitBranches(run: GitExec = runGit): GitBranches {
  const listInFlight = new Map<string, Promise<GitBranchesOutcome>>();
  /** 全局 checkout 串行尾节点（跨 cwd 也串行：不同 cwd 可能指向同一仓库）。 */
  let checkoutTail: Promise<unknown> = Promise.resolve();

  const readBranches = async (cwd: string): Promise<GitBranchesOutcome> => {
    const probe = await run(['rev-parse', '--git-dir'], cwd);
    if (probe.error !== null) return { ok: false, error: failureError(probe) };
    if (probe.code !== 0) {
      // 非仓库是正常形态（新建任务页允许选任意目录）：降级为空列表，其余报错照实透传
      const failure = mapGitFailure(probe.stderr);
      if (failure.kind === 'not_a_repo') return okBranches({ isRepo: false, current: null, branches: [], dirtyFiles: 0 });
      return { ok: false, error: failure };
    }
    const refs = await run(['for-each-ref', '--format=%(refname:short)', 'refs/heads'], cwd);
    if (refs.error !== null) return { ok: false, error: failureError(refs) };
    if (refs.code !== 0) return { ok: false, error: mapGitFailure(refs.stderr) };
    const head = await run(['symbolic-ref', '--short', '-q', 'HEAD'], cwd);
    if (head.error !== null) return { ok: false, error: failureError(head) };
    const current = head.code === 0 ? head.stdout.trim() : '';
    const status = await run(['status', '--porcelain', '--untracked-files=no'], cwd);
    if (status.error !== null) return { ok: false, error: failureError(status) };
    if (status.code !== 0) return { ok: false, error: mapGitFailure(status.stderr) };
    return okBranches({
      isRepo: true,
      current: current.length > 0 ? current : null,
      branches: parseBranchList(refs.stdout),
      dirtyFiles: parseDirtyCount(status.stdout),
    });
  };

  const switchBranch = async (cwd: string, branch: string, create: boolean): Promise<GitCheckoutOutcome> => {
    // 选项形/非法 ref 名先于 git 拦住：`git checkout --detach` 这类会「成功」改变 HEAD
    if (!isValidBranchName(branch)) return { ok: false, error: appError('invalid_branch') };

    const probe = await run(['rev-parse', '--git-dir'], cwd);
    if (probe.error !== null) return { ok: false, error: failureError(probe) };
    if (probe.code !== 0) return { ok: false, error: mapGitFailure(probe.stderr) };

    const refs = await run(['for-each-ref', '--format=%(refname:short)', 'refs/heads'], cwd);
    if (refs.error !== null) return { ok: false, error: failureError(refs) };
    if (refs.code !== 0) return { ok: false, error: mapGitFailure(refs.stderr) };
    const existing = parseBranchList(refs.stdout);
    if (create && existing.includes(branch)) return { ok: false, error: appError('branch_exists') };
    if (!create && !existing.includes(branch)) return { ok: false, error: appError('unknown_branch') };

    const head = await run(['symbolic-ref', '--short', '-q', 'HEAD'], cwd);
    if (head.error !== null) return { ok: false, error: failureError(head) };
    const current = head.code === 0 ? head.stdout.trim() : '';
    if (!create && current === branch) return { ok: true, data: { branch } };

    // 切到既有分支：已跟踪文件的改动会阻止切换或丢改动，先拒绝
    // （新建分支不改工作树，脏树允许——未跟踪文件的覆盖冲突由 git 自身报错）
    if (!create) {
      const status = await run(['status', '--porcelain', '--untracked-files=no'], cwd);
      if (status.error !== null) return { ok: false, error: failureError(status) };
      if (status.code !== 0) return { ok: false, error: mapGitFailure(status.stderr) };
      if (status.stdout.trim().length > 0) return { ok: false, error: appError('dirty_worktree') };
    }

    const checkout = await run(create ? ['checkout', '-b', branch] : ['checkout', branch], cwd);
    if (checkout.error !== null) return { ok: false, error: failureError(checkout) };
    if (checkout.code !== 0) return { ok: false, error: mapGitFailure(checkout.stderr) };
    return { ok: true, data: { branch } };
  };

  return {
    list: (cwd) => {
      const running = listInFlight.get(cwd);
      if (running !== undefined) return running;
      const task = readBranches(cwd).finally(() => {
        listInFlight.delete(cwd);
      });
      listInFlight.set(cwd, task);
      return task;
    },
    checkout: (cwd, branch, create) => {
      const task = checkoutTail.then(
        () => switchBranch(cwd, branch, create),
        () => switchBranch(cwd, branch, create),
      );
      checkoutTail = task.then(
        () => undefined,
        () => undefined,
      );
      // 切换成功后失效列表单飞缓存：否则紧随的 list 会复用切换前的在途快照，界面停在旧分支
      void task.then((outcome) => {
        if (outcome.ok) listInFlight.delete(cwd);
      });
      return task;
    },
  };
}
