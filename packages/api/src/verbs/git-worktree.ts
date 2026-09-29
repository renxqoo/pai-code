import type { WorktreeEntryView } from '@paiapp/contracts';
import { appError, type ApiError } from '../errors';
import { failureError, isValidBranchName, type GitExec } from './git-branches';

/**
 * 会话级 worktree 能力（SESSION-WORKTREE-WORKFLOW §1.1/§1.4/§2.1）：
 * create 七步预检链（条件半建兜底 CAS）· remove 四道门（占用→merged→clean→CAS）
 * · merge 预检双门 + --no-ff · list 逐树降级。
 * 数据安全判据 = merge-base --is-ancestor tip 被任一其他本地分支包含（三域同构）；
 * 删分支单轨 CAS（update-ref -d <pinned-tip> + show-ref 复核幂等）；verb 恒重评。
 */

export type WorktreeOutcome<T> = { ok: true; data: T } | { ok: false; error: ApiError };

export interface WorktreeCreateResult {
  readonly path: string;
  readonly branch: string;
}

export interface WorktreeMergeResult {
  readonly branch: string;
  readonly merged: true;
}

/** 占用门数据源（冷路径注入——api 包不持会话态）。 */
export interface WorktreeOccupancy {
  /** 目标树路径是否被 live/parked 会话或运行中子代理占用（fail-closed 由宿主实现承担）。 */
  readonly isOccupied: (path: string) => Promise<boolean>;
}

/** 宿主路径/文件系统能力注入（api 包无 node 域）。 */
export interface WorktreeEnv {
  readonly isAbsolute: (path: string) => boolean;
  readonly resolve: (...segments: string[]) => string;
  readonly dirname: (path: string) => string;
  readonly join: (...segments: string[]) => string;
  readonly basename: (path: string) => string;
  readonly exists: (path: string) => boolean;
  /** 物理归一（porcelain 输出恒 realpath 形——symlink 入口下逻辑路径与登记路径不匹配，remove/list 按字符串匹配必失败）。 */
  readonly realpath: (path: string) => string;
  /** 跨进程 repo 锁（完整规格复刻 x-harness lockfile——获取协议由宿主注入）。 */
  readonly withRepoLock: <T>(repoTop: string, critical: () => Promise<T>) => Promise<T>;
}

export interface GitWorktree {
  list: (cwd: string) => Promise<WorktreeOutcome<{ worktrees: WorktreeEntryView[] }>>;
  create: (cwd: string, branch: string) => Promise<WorktreeOutcome<WorktreeCreateResult>>;
  remove: (cwd: string, path: string) => Promise<WorktreeOutcome<null>>;
  merge: (cwd: string, branch: string) => Promise<WorktreeOutcome<WorktreeMergeResult>>;
}

/** 用户树独立区目录名（与子代理区 .x-harness-worktrees 物理隔离——永不自动清理域）。 */
const USER_WORKTREES_DIR = ".x-harness-user-worktrees";

/** 分支名 → 单段目录名编码（/ → -；路径安全拒于 isValidBranchName + existsSync 冲突探测）。 */
export function encodeBranchDir(branch: string): string {
  return branch.replace(/\//g, "-");
}

/** worktree list --porcelain 解析（branch 行缺席 = detached → null）。 */
export interface ParsedWorktree {
  readonly path: string;
  readonly branch: string | null;
  readonly head: string | null;
  readonly locked: boolean;
  readonly prunable: boolean;
}

export function parseWorktreePorcelain(stdout: string): ParsedWorktree[] {
  const out: ParsedWorktree[] = [];
  let cur: { path: string | null; branch: string | null; head: string | null; locked: boolean; prunable: boolean } = { path: null, branch: null, head: null, locked: false, prunable: false };
  const flush = (): void => {
    if (cur.path !== null) out.push({ path: cur.path, branch: cur.branch, head: cur.head, locked: cur.locked, prunable: cur.prunable });
    cur = { path: null, branch: null, head: null, locked: false, prunable: false };
  };
  for (const line of stdout.split("\n")) {
    if (line.startsWith("worktree ")) {
      flush();
      cur.path = line.slice("worktree ".length).trim();
    } else if (line.startsWith("branch ")) {
      cur.branch = line.slice("branch ".length).trim().replace(/^refs\/heads\//, "");
    } else if (line.startsWith("HEAD ")) {
      cur.head = line.slice("HEAD ".length).trim();
    } else if (line.startsWith("locked")) {
      cur.locked = true;
    } else if (line.startsWith("prunable")) {
      cur.prunable = true;
    }
  }
  flush();
  return out;
}

/**「其他本地分支」枚举（显式排除目标自身——is-ancestor(b,b) 恒真 = 门恒放行全量丢失）。 */
export async function otherLocalBranches(run: GitExec, cwd: string, selfRef: string): Promise<string[] | null> {
  const result = await run(["for-each-ref", "refs/heads", "--format=%(refname)"], cwd);
  if (result.error !== null || result.code !== 0) return null;
  return result.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter((ref) => ref !== "" && ref !== selfRef);
}

/** 收编门：merge-base --is-ancestor tip 被任一其他本地分支包含。
 *  exit 0=包含放行 / 1=不包含继续探测 / ≥2=命令级失败 fail-closed（对齐 is-ancestor 三态）。 */
export async function isMergedIntoOthers(run: GitExec, repoTop: string, tip: string, others: readonly string[]): Promise<boolean | null> {
  for (const ref of others) {
    const result = await run(["merge-base", "--is-ancestor", tip, ref], repoTop);
    if (result.error !== null || result.code === null) return null;
    if (result.code === 0) return true;
    if (result.code === 1) continue;
    return null;
  }
  return false;
}

/** unmergedCount（rev-list 纯计数——确认框文案；判据是 isMergedIntoOthers 布尔，本数非判据）。 */
async function unmergedCountOf(run: GitExec, repoTop: string, tip: string, others: readonly string[]): Promise<number | undefined> {
  if (others.length === 0) return 1;
  const result = await run(["rev-list", "--count", tip, "--not", ...others], repoTop);
  if (result.error !== null || result.code !== 0) return undefined;
  const count = Number.parseInt(result.stdout.trim(), 10);
  return Number.isSafeInteger(count) && count >= 0 ? count : undefined;
}

/** repoTop 归一（--git-common-dir → resolve → dirname；锁键第二步对主仓取 --show-toplevel 原样）。 */
async function repoTopOf(run: GitExec, cwd: string, env: WorktreeEnv): Promise<string | null> {
  const common = await run(["rev-parse", "--git-common-dir"], cwd);
  if (common.error !== null || common.code !== 0 || common.stdout.trim() === "") return null;
  const gitDir = env.isAbsolute(common.stdout.trim()) ? common.stdout.trim() : env.resolve(cwd, common.stdout.trim());
  return env.dirname(gitDir);
}

/** 树内 cwd 门（--git-common-dir ≠ --git-dir 归一 → linked worktree 内）。 */
async function isNestedWorktreeCwd(run: GitExec, cwd: string, env: WorktreeEnv): Promise<boolean | null> {
  const common = await run(["rev-parse", "--git-common-dir"], cwd);
  const gitDir = await run(["rev-parse", "--git-dir"], cwd);
  if (common.error !== null || common.code !== 0 || gitDir.error !== null || gitDir.code !== 0) return null;
  const norm = (out: string): string => (env.isAbsolute(out) ? out : env.resolve(cwd, out));
  return norm(common.stdout.trim()) !== norm(gitDir.stdout.trim());
}

/** CAS 删分支：update-ref -d <ref> <pinned-tip>；exit 0 成功 / 非 0 → show-ref 复核（缺席=幂等成功，在场=漂移）。 */
export type CasOutcome = "deleted" | "idempotent" | "drifted" | "failed";

export async function casDeleteBranch(run: GitExec, repoTop: string, branch: string, pinnedTip: string): Promise<CasOutcome> {
  const ref = `refs/heads/${branch}`;
  const cas = await run(["update-ref", "-d", ref, pinnedTip], repoTop);
  if (cas.error === null && cas.code === 0) return "deleted";
  const verify = await run(["show-ref", "--verify", "--quiet", ref], repoTop);
  if (verify.error !== null) return "failed";
  return verify.code === 0 ? "drifted" : "idempotent";
}

export function createGitWorktree(run: GitExec, env: WorktreeEnv, occupancy?: WorktreeOccupancy): GitWorktree {
  /** 写操作全局串行尾链（create/remove/merge 与 checkout 同域——工作树独占资源）。 */
  let writeTail: Promise<unknown> = Promise.resolve();
  const serialize = <T>(task: () => Promise<T>): Promise<T> => {
    const next = writeTail.then(task, task);
    writeTail = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  };

  const list = async (cwd: string): Promise<WorktreeOutcome<{ worktrees: WorktreeEntryView[] }>> => {
    const repoTop = await repoTopOf(run, cwd, env);
    if (repoTop === null) return { ok: true, data: { worktrees: [] } };
    const porcelain = await run(["worktree", "list", "--porcelain"], cwd);
    if (porcelain.error !== null) return { ok: false, error: failureError(porcelain) };
    if (porcelain.code !== 0) return { ok: true, data: { worktrees: [] } };
    const mainGitDir = env.join(repoTop, ".git");
    const entries: WorktreeEntryView[] = [];
    for (const wt of parseWorktreePorcelain(porcelain.stdout)) {
      if (wt.path === repoTop) continue;
      if (wt.path === mainGitDir) continue;
      const selfRef = wt.branch !== null ? `refs/heads/${wt.branch}` : "";
      const others = selfRef !== "" ? await otherLocalBranches(run, repoTop, selfRef) : await otherLocalBranches(run, repoTop, "__none__");
      if (others === null) continue; // 逐树降级不崩
      const tip = wt.head ?? wt.branch;
      if (tip === null) continue; // HEAD 行缺席不可判——省略形态
      const merged = await isMergedIntoOthers(run, repoTop, tip, others);
      if (merged === null) continue;
      const unmerged = await unmergedCountOf(run, repoTop, tip, others);
      let clean = false;
      if (env.exists(wt.path)) {
        const status = await run(["-C", wt.path, "status", "--porcelain", "--ignored"], repoTop);
        if (status.error !== null || status.code === 0) clean = status.code === 0 && status.stdout.trim() === "";
        else clean = false;
      }
      entries.push({
        path: wt.path,
        branch: wt.branch,
        clean,
        merged,
        ...(unmerged !== undefined ? { unmergedCount: unmerged } : {}),
        ...(wt.locked ? { locked: true } : {}),
        ...(wt.prunable ? { prunable: true } : {}),
      });
    }
    return { ok: true, data: { worktrees: entries } };
  };

  const create = (cwd: string, branch: string): Promise<WorktreeOutcome<WorktreeCreateResult>> =>
    serialize(async () => {
      if (!isValidBranchName(branch)) return { ok: false, error: appError("invalid_branch") };
      const repoTop = await repoTopOf(run, cwd, env);
      if (repoTop === null) return { ok: false, error: appError("not_a_repo") };
      // 步骤 2：分支存在预检（show-ref --verify 精确匹配；此失败路绝不跑兜底）
      const existing = await run(["show-ref", "--verify", "--quiet", `refs/heads/${branch}`], repoTop);
      if (existing.error === null && existing.code === 0) return { ok: false, error: appError("branch_exists") };
      // 步骤 3/4：detached 与 unborn 门（symbolic-ref -q HEAD + rev-parse --verify HEAD）
      const symbolic = await run(["symbolic-ref", "-q", "HEAD"], repoTop);
      if (symbolic.error === null && symbolic.code !== 0) return { ok: false, error: appError("worktree_detached_head") };
      const head = await run(["rev-parse", "--verify", "HEAD"], repoTop);
      if (head.error !== null || head.code !== 0 || head.stdout.trim() === "") return { ok: false, error: appError("worktree_detached_head", "unborn HEAD: no commits yet") };
      const startTip = head.stdout.trim();
      // 步骤 5：树内 cwd 门
      const nested = await isNestedWorktreeCwd(run, cwd, env);
      if (nested === null) return { ok: false, error: appError("not_a_repo") };
      if (nested) return { ok: false, error: appError("worktree_nested") };
      // 步骤 6：路径编码 + 冲突探测
      const logicalPath = env.join(env.dirname(repoTop), USER_WORKTREES_DIR, `${env.basename(repoTop)}-${encodeBranchDir(branch)}`);
      // 未知形态先于 git：目录在（任意拼法）即拒——realpath 仅对存在路径归一（不存在路径归一无意义且 ENOENT）
      if (env.exists(logicalPath)) return { ok: false, error: appError("worktree_path_exists", logicalPath) };
      // 步骤 7：持锁建树 + 条件半建兜底 CAS
      return env.withRepoLock(repoTop, async () => {
        const add = await run(["worktree", "add", "-b", branch, logicalPath, "HEAD"], repoTop);
        if (add.error === null && add.code === 0) return { ok: true, data: { path: env.realpath(logicalPath), branch } };
        const verify = await run(["rev-parse", "--verify", `refs/heads/${branch}^{commit}`], repoTop);
        const halfBuilt = verify.error === null && verify.code === 0 && verify.stdout.trim() === startTip;
        if (halfBuilt) {
          const cas = await casDeleteBranch(run, repoTop, branch, startTip);
          if (cas === "failed") {
            await run(["worktree", "prune"], repoTop);
          }
        }
        return { ok: false, error: failureError(add) };
      });
    });

  const remove = (cwd: string, path: string): Promise<WorktreeOutcome<null>> =>
    serialize(async () => {
      const repoTop = await repoTopOf(run, cwd, env);
      if (repoTop === null) return { ok: false, error: appError("not_a_repo") };
      const physicalPath = env.realpath(path);
      if (occupancy !== undefined && (await occupancy.isOccupied(physicalPath))) {
        return { ok: false, error: appError("worktree_in_use", physicalPath) };
      }
      return env.withRepoLock(repoTop, async () => {
        const porcelain = await run(["worktree", "list", "--porcelain"], repoTop);
        if (porcelain.error !== null) return { ok: false, error: failureError(porcelain) };
        if (porcelain.code !== 0) return { ok: false, error: failureError(porcelain) };
        const target = parseWorktreePorcelain(porcelain.stdout).find((wt) => wt.path === physicalPath);
        if (target === undefined) return { ok: false, error: appError("invalid_params", `no worktree at ${path}`) };
        // merged 门（无条件——含 gone-dir；detached 以 HEAD sha 同判据）
        const tip = target.head ?? target.branch;
        if (tip === null) return { ok: false, error: appError("worktree_dirty", "登记失真（HEAD 不可读）——请手动 git worktree prune 后重试") };
        const selfRef = target.branch !== null ? `refs/heads/${target.branch}` : "";
        const others = await otherLocalBranches(run, repoTop, selfRef === "" ? "__none__" : selfRef);
        if (others === null) return { ok: false, error: appError("worktree_dirty", "分支枚举失败（fail-closed）") };
        const merged = await isMergedIntoOthers(run, repoTop, tip, others);
        if (merged === null) return { ok: false, error: appError("worktree_dirty", "收编判定失败（fail-closed）") };
        if (!merged) {
          const count = await unmergedCountOf(run, repoTop, tip, others);
          return { ok: false, error: appError("worktree_dirty", `${count ?? "?"} 个提交未并入任何本地分支——先「合并回主仓」再清理`) };
        }
        // clean 门（仅目录在场；含 ignored）
        if (env.exists(path)) {
          const status = await run(["-C", physicalPath, "status", "--porcelain", "--ignored"], repoTop);
          if (status.error !== null) return { ok: false, error: appError("worktree_dirty", "目录已不存在但 git 仍有登记——git worktree prune 后重试") };
          if (status.code !== 0) return { ok: false, error: appError("worktree_dirty", "状态不可读（fail-closed）——git worktree prune 后重试") };
          if (status.stdout.trim() !== "") {
            const lines = status.stdout.split("\n").filter((line) => line.trim() !== "");
            const ignored = lines.filter((line) => line.startsWith("!!")).length;
            const untracked = lines.filter((line) => line.includes("??")).length;
            const changed = lines.length - ignored - untracked;
            return { ok: false, error: appError("worktree_dirty", `树内有未纳入分支的内容（${changed} 处改动 / ${untracked} 个未跟踪 / ${ignored} 个忽略），处理或提交后重试`) };
          }
        }
        // remove + CAS 删分支（detached 树无 ref 可 CAS → remove 成功即终态）
        const removeRun = await run(["worktree", "remove", physicalPath], repoTop);
        if (removeRun.error !== null || removeRun.code !== 0) {
          if (/cannot remove a locked working tree/.test(removeRun.stderr)) return { ok: false, error: appError("worktree_locked", physicalPath) };
          return { ok: false, error: failureError(removeRun) };
        }
        if (target.branch === null) return { ok: true, data: null };
        const cas = await casDeleteBranch(run, repoTop, target.branch, tip);
        if (cas === "deleted" || cas === "idempotent") return { ok: true, data: null };
        if (cas === "drifted") return { ok: false, error: appError("worktree_dirty", `分支 ${target.branch} 在清理期间有新提交（已保留分支与内容）——请确认后重试`) };
        return { ok: false, error: appError("internal_error", `git_failed:branch delete failed for ${target.branch}`) };
      });
    });

  const merge = (cwd: string, branch: string): Promise<WorktreeOutcome<WorktreeMergeResult>> =>
    serialize(async () => {
      if (!isValidBranchName(branch)) return { ok: false, error: appError("invalid_branch") };
      const repoTop = await repoTopOf(run, cwd, env);
      if (repoTop === null) return { ok: false, error: appError("not_a_repo") };
      // 预检双门：树内 cwd + 主仓 detached
      const nested = await isNestedWorktreeCwd(run, cwd, env);
      if (nested === null) return { ok: false, error: appError("not_a_repo") };
      if (nested) return { ok: false, error: appError("worktree_nested") };
      const symbolic = await run(["symbolic-ref", "-q", "HEAD"], repoTop);
      if (symbolic.error === null && symbolic.code !== 0) return { ok: false, error: appError("worktree_detached_head") };
      const result = await run(["merge", "--no-ff", branch], repoTop);
      if (result.error !== null) return { ok: false, error: failureError(result) };
      if (result.code !== 0) {
        if (/Automatic merge failed|CONFLICT/.test(`${result.stderr}\n${result.stdout}`)) {
          return { ok: false, error: appError("conflict_files", "merge conflict: resolve in the main session (agent) or git merge --abort") };
        }
        return { ok: false, error: failureError(result) };
      }
      return { ok: true, data: { branch, merged: true } };
    });

  return { list, create, remove, merge };
}
