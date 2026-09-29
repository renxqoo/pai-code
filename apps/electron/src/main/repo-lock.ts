import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';

/**
 * 跨进程 repo 锁（SESSION-WORKTREE-WORKFLOW §3——x-harness lockfile 完整规格复刻，
 * 纯规格复用非包依赖）：锁目录物理钉死在子代理区 `.x-harness-worktrees/repo-<hash(lockKey)>.lock`
 * （sweep 的 repo-*.lock 过滤天然兼容）；获取协议整套同语义——mkdir 原子占位、pid 存活探测、
 * 30s 创建窗口、stale 抢占、60s 有界等待后降级直跑（降级经 onDegraded 可观测）。
 * lockKey = 主仓目录的 --show-toplevel 原样输出（两侧字符串一致才互斥；树内 cwd 先归一主仓）。
 */

const CREATING_WINDOW_MS = 30_000;
const LOCK_WAIT_MS = 60_000;
const RETRY_MS = 25;

function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as { code?: unknown }).code === 'EPERM';
  }
}

async function lockHolder(lockDir: string, opts: { creatingCountsAsHeld: boolean }): Promise<number | undefined> {
  const raw = await readFile(join(lockDir, 'pid'), 'utf8').catch(() => undefined);
  if (raw === undefined) {
    if (!opts.creatingCountsAsHeld) return undefined;
    const info = await stat(lockDir).catch(() => undefined);
    if (info === undefined) return undefined;
    return Date.now() - info.mtimeMs < CREATING_WINDOW_MS ? Number.NaN : undefined;
  }
  const pid = Number.parseInt(raw.trim(), 10);
  return Number.isSafeInteger(pid) && pid > 0 && pidAlive(pid) ? pid : undefined;
}

/** 锁目录路径（x-harness repoLockPath 同公式——hash 输入 lockKey 字符串逐字节一致）。 */
export function repoLockPath(worktreeParentDir: string, lockKey: string): string {
  let hash = 0;
  for (const ch of lockKey) hash = ((hash << 5) - hash + ch.charCodeAt(0)) | 0;
  return join(worktreeParentDir, `repo-${(hash >>> 0).toString(16)}.lock`);
}

/** 锁目录内容指纹（调试面：pid + 生成时刻）。 */
async function lockFingerprint(lockDir: string): Promise<string> {
  const pid = await readFile(join(lockDir, 'pid'), 'utf8').catch(() => 'unreadable');
  const digest = createHash('sha256').update(String(pid).trim()).digest('hex').slice(0, 8);
  return `pid=${String(pid).trim()} fp=${digest}`;
}

export interface RepoLockOptions {
  /** 降级出口（互斥失效——超时/环境性错误时上报，缺省静默）。 */
  readonly onDegraded?: (reason: string) => void;
}

export async function withRepoLock<T>(repoTop: string, critical: () => Promise<T>, options: RepoLockOptions = {}): Promise<T> {
  const degraded = (reason: string): void => options.onDegraded?.(`repo lock degraded (${reason}): ${repoTop}`);
  const runUnlocked = (reason: string): Promise<T> => {
    degraded(reason);
    return critical();
  };
  const worktreeParentDir = join(dirname(repoTop), '.x-harness-worktrees');
  const lockDir = repoLockPath(worktreeParentDir, repoTop);
  const parentReady = await mkdir(dirname(lockDir), { recursive: true }).then(
    () => true,
    () => false,
  );
  if (!parentReady) return runUnlocked('parent dir unwritable');
  const deadline = Date.now() + LOCK_WAIT_MS;
  for (;;) {
    try {
      await mkdir(lockDir, { recursive: false });
    } catch (error) {
      const code = (error as { code?: unknown }).code;
      if (code === 'ENOENT' && Date.now() <= deadline) {
        await mkdir(dirname(lockDir), { recursive: true }).catch(() => {});
        continue;
      }
      if (code !== 'EEXIST') return runUnlocked(`mkdir ${typeof code === 'string' ? code : 'unknown error'}`);
      const holder = await lockHolder(lockDir, { creatingCountsAsHeld: true });
      if (holder !== undefined) {
        if (Date.now() > deadline) {
          const fp = await lockFingerprint(lockDir).catch(() => 'unreadable');
          return runUnlocked(`wait timeout holder ${fp}`);
        }
        await new Promise((resolve) => {
          setTimeout(resolve, RETRY_MS);
        });
        continue;
      }
      await rm(lockDir, { recursive: true, force: true }).catch(() => {});
      continue;
    }
    try {
      await writeFile(join(lockDir, 'pid'), String(process.pid));
    } catch {
      await rm(lockDir, { recursive: true, force: true }).catch(() => {});
      return runUnlocked('pid file unwritable');
    }
    try {
      return await critical();
    } finally {
      const current = await readFile(join(lockDir, 'pid'), 'utf8').catch(() => undefined);
      if (current?.trim() === String(process.pid)) await rm(lockDir, { recursive: true, force: true }).catch(() => {});
    }
  }
}
