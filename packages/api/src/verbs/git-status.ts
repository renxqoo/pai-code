import type { GitStatusFile, GitStatusView } from '@paiapp/contracts';
import type { ApiError } from '../errors';
import { failureError, mapGitFailure, type GitExec } from './git-branches';

/**
 * 工作区变更速览（速览面板 Git 区数据源）：只读连读（仓库探测 / HEAD 分支 /
 * porcelain 变更文件 / numstat 增删行数）+ 上游计数。增删行数口径 = 已跟踪变更
 * 相对 HEAD（含 staged）；untracked 基线不可得恒 0；无 HEAD（空仓库）或无上游
 * 的计数面降级为 0，不报错。files 超上限截断展示（计数全量）；同 cwd 在途复用。
 */

export type GitStatusOutcome = { ok: true; data: GitStatusView } | { ok: false; error: ApiError };

/** files 展示上限（payload 有界；fileCount 与增删计数仍全量）。 */
export const STATUS_FILES_LIMIT = 200;

const emptyStatus: GitStatusView = {
  isRepo: false,
  current: null,
  files: [],
  fileCount: 0,
  truncated: false,
  additions: 0,
  deletions: 0,
  ahead: 0,
  behind: 0,
};

const okStatus = (data: GitStatusView): GitStatusOutcome => ({ ok: true, data });

/** porcelain 单行（XY <path> / XY <old> -> <new>）→ 变更文件条目（行数由 numstat 合并）。 */
export function parseStatusLine(line: string): GitStatusFile | null {
  if (line.length < 4) return null;
  const x = line[0] ?? ' ';
  const y = line[1] ?? ' ';
  const rawPath = line.slice(3);
  if (x === '?' && y === '?') return { path: unquote(rawPath), kind: 'untracked', additions: 0, deletions: 0 };
  const path = renameTarget(rawPath);
  if (x === 'R' || x === 'C') return { path, kind: 'renamed', additions: 0, deletions: 0 };
  if (x === 'A') return { path, kind: 'added', additions: 0, deletions: 0 };
  if (x === 'D' || y === 'D') return { path, kind: 'deleted', additions: 0, deletions: 0 };
  return { path: unquote(rawPath), kind: 'modified', additions: 0, deletions: 0 };
}

/** `status --porcelain` 输出 → 变更文件列表（空行跳过、垃圾行忽略）。 */
export function parseStatusPorcelain(stdout: string): GitStatusFile[] {
  const files: GitStatusFile[] = [];
  for (const line of stdout.split('\n')) {
    if (line.trim().length === 0) continue;
    const file = parseStatusLine(line);
    if (file !== null) files.push(file);
  }
  return files;
}

/** `diff --numstat` 单行（add\tdel\tpath，rename 形态 old => new / {old => new}）→ 条目。 */
export function parseNumstatLine(line: string): { path: string; additions: number; deletions: number } | null {
  const parts = line.split('\t');
  if (parts.length < 3) return null;
  const additions = Number.parseInt(parts[0] ?? '', 10);
  const deletions = Number.parseInt(parts[1] ?? '', 10);
  // 二进制文件行数显示 `-`：无行数语义按 0 计
  const path = renameTarget(parts.slice(2).join('\t'));
  return {
    path,
    additions: Number.isFinite(additions) && additions > 0 ? additions : 0,
    deletions: Number.isFinite(deletions) && deletions > 0 ? deletions : 0,
  };
}

/** `diff --numstat` 输出 → path → 增删行数；同一 path 多段（rename 拆段）累加。 */
export function parseNumstat(stdout: string): Map<string, { additions: number; deletions: number }> {
  const totals = new Map<string, { additions: number; deletions: number }>();
  for (const line of stdout.split('\n')) {
    if (line.trim().length === 0) continue;
    const entry = parseNumstatLine(line);
    if (entry === null) continue;
    const existing = totals.get(entry.path);
    totals.set(entry.path, {
      additions: (existing?.additions ?? 0) + entry.additions,
      deletions: (existing?.deletions ?? 0) + entry.deletions,
    });
  }
  return totals;
}

/** `rev-list --left-right --count HEAD...@{upstream}` 输出（"<ahead>\t<behind>"）→ 上游计数；垃圾 = null。 */
export function parseRevListCount(stdout: string): { ahead: number; behind: number } | null {
  const parts = stdout.trim().split(/\s+/);
  if (parts.length < 2) return null;
  const ahead = Number.parseInt(parts[0] ?? '', 10);
  const behind = Number.parseInt(parts[1] ?? '', 10);
  if (!Number.isFinite(ahead) || !Number.isFinite(behind)) return null;
  return { ahead: Math.max(0, ahead), behind: Math.max(0, behind) };
}

/** rename 展示形态归一（`old -> new` / `{old => new}` / `old => new` → new）。 */
function renameTarget(path: string): string {
  const arrow = path.lastIndexOf(' -> ');
  const fatArrow = path.lastIndexOf(' => ');
  const index = Math.max(arrow, fatArrow);
  const target = index === -1 ? path : path.slice(index + 4);
  return unquote(target.endsWith('}') ? target.slice(0, -1) : target);
}

/** git 引号路径剥离（含特殊字符的路径被 git 双引号包裹；转义序列不还原，照实展示）。 */
function unquote(path: string): string {
  if (path.length >= 2 && path.startsWith('"') && path.endsWith('"')) return path.slice(1, -1);
  return path;
}

export interface GitStatus {
  status: (cwd: string) => Promise<GitStatusOutcome>
  /** checkout 成功后失效（丢弃在途复用——切前读的快照不得回吐给新调用；镜像 GitGraph.invalidate）。 */
  invalidate: (cwd: string) => void
}

export function createGitStatus(run: GitExec): GitStatus {
  const inFlight = new Map<string, Promise<GitStatusOutcome>>();

  const readStatus = async (cwd: string): Promise<GitStatusOutcome> => {
    const probe = await run(['rev-parse', '--git-dir'], cwd);
    if (probe.error !== null) return { ok: false, error: failureError(probe) };
    if (probe.code !== 0) {
      const failure = mapGitFailure(probe.stderr);
      // 非仓库是正常形态：空形态降级（与 git/branches 同规）
      if (failure.kind === 'not_a_repo') return okStatus(emptyStatus);
      return { ok: false, error: failure };
    }
    const head = await run(['symbolic-ref', '--short', '-q', 'HEAD'], cwd);
    if (head.error !== null) return { ok: false, error: failureError(head) };
    const current = head.code === 0 ? head.stdout.trim() : '';

    const porcelain = await run(['status', '--porcelain'], cwd);
    if (porcelain.error !== null) return { ok: false, error: failureError(porcelain) };
    if (porcelain.code !== 0) return { ok: false, error: mapGitFailure(porcelain.stderr) };
    const files = parseStatusPorcelain(porcelain.stdout);

    // 空仓库（unborn HEAD）diff HEAD 无基线：计数面降级 0，untracked/added 照常展示
    let additions = 0;
    let deletions = 0;
    const hasHead = await run(['rev-parse', '--verify', 'HEAD'], cwd);
    if (hasHead.error !== null) return { ok: false, error: failureError(hasHead) };
    if (hasHead.code === 0) {
      const numstat = await run(['diff', '--numstat', 'HEAD'], cwd);
      if (numstat.error !== null) return { ok: false, error: failureError(numstat) };
      if (numstat.code !== 0) return { ok: false, error: mapGitFailure(numstat.stderr) };
      const byPath = parseNumstat(numstat.stdout);
      for (const entry of byPath.values()) {
        additions += entry.additions;
        deletions += entry.deletions;
      }
      for (const file of files) {
        const entry = byPath.get(file.path);
        if (entry !== undefined) {
          file.additions = entry.additions;
          file.deletions = entry.deletions;
        }
      }
    }

    // 上游计数（detached / 无上游 / 空仓库均非错误：降级 0）
    let ahead = 0;
    let behind = 0;
    const revList = await run(['rev-list', '--left-right', '--count', 'HEAD...@{upstream}'], cwd);
    if (revList.error !== null) return { ok: false, error: failureError(revList) };
    if (revList.code === 0) {
      const counts = parseRevListCount(revList.stdout);
      if (counts !== null) ({ ahead, behind } = counts);
    }

    return okStatus({
      isRepo: true,
      current: current.length > 0 ? current : null,
      files: files.slice(0, STATUS_FILES_LIMIT),
      fileCount: files.length,
      truncated: files.length > STATUS_FILES_LIMIT,
      additions,
      deletions,
      ahead,
      behind,
    });
  };

  return {
    status: (cwd) => {
      const running = inFlight.get(cwd);
      if (running !== undefined) return running;
      const task = readStatus(cwd).finally(() => {
        inFlight.delete(cwd);
      });
      inFlight.set(cwd, task);
      return task;
    },
    invalidate: (cwd) => {
      inFlight.delete(cwd);
    },
  };
}
