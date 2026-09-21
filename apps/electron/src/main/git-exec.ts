import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';

import { classifyGitExecError, type GitExec } from '@paiapp/api';

/**
 * git 执行器（GitExec 的宿主默认实现）：execFile 无 shell + 超时 + 输出上限 +
 * 仓库可执行面隔离。git 读口族（分支/图谱）共用；纯逻辑与解析在 @paiapp/api。
 */

const GIT_TIMEOUT_MS = 5000;
/** 单条命令输出上限（分支列表/状态在正常仓库远小于此）。 */
const GIT_MAX_BUFFER = 1 << 20;
/**
 * 隔离仓库自带的可执行面：仓库本地 config 的 hooks 与 fsmonitor 都指向可执行文件，
 * 克隆来的恶意仓库能让「切分支」在 main 进程全权限下执行任意代码（绕开 hub 沙箱）。
 * -c 必须位于子命令之前；core.hooksPath 指向不存在的目录即等于无 hook。
 */
const GIT_ISOLATION_ARGS: readonly string[] = ['-c', 'core.hooksPath=/dev/null', '-c', 'core.fsmonitor=false'];

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
