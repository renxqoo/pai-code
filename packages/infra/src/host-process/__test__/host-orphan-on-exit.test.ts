/**
 * 红测：主进程未走 dispose 退出 → detached host 子进程成为孤儿
 *
 * 症状：Electron 主进程对 SIGTERM/kill/启动期退出没有兜底（无 process.on('SIGTERM')
 * 处理器；before-quit 处理器注册在 whenReady 回调末尾、await runtime.start() 之后）。
 * host 以 detached: true spawn（create-host-process.ts:152），主进程死亡不会带走
 * host——主进程在 host 已 spawn 且未 dispose 的窗口退出（启动期 Cmd+Q、kill、系统
 * 关机信号）后，x-harness hub 进程残留，继续占用资源与会话文件句柄。
 *
 * 本测驱动真实 createHostProcess（替身脚本）+ 父进程退出，断言「主进程退出后 host
 * 不存活」；现状为红（host 存活 = 孤儿）。
 */
import { describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

const pidAlive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

describe('host 孤儿：主进程退出（未 dispose）后 host 存活', () => {
  test('主进程 process.exit 后 host 应被带走；现状：detached host 残留为孤儿', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'pai-orphan-red-'));
    const pidFile = join(dir, 'host.pid');
    const env = {
      ...process.env,
      ORPHAN_PID_FILE: pidFile,
      ORPHAN_HOST_SCRIPT: join(import.meta.dir, 'fixtures', 'orphan-host.ts'),
    };

    const parent = Bun.spawn([process.execPath, join(import.meta.dir, 'fixtures', 'orphan-parent.ts')], {
      env,
      stdout: 'pipe',
      stderr: 'pipe',
    });
    const exitCode = await parent.exited;
    expect(exitCode).toBe(0); // 装置有效：父进程正常退出且 host 已就绪

    // 父进程已退出——host 若被主进程生命周期管理带走，此刻应已死
    await sleep(400);
    const pid = Number(await Bun.file(pidFile).text());
    let alive = pidAlive(pid);
    try {
      if (alive) {
        // 清理孤儿，避免测试机残留
        try { process.kill(-pid, 'SIGKILL'); } catch { /* 组杀失败退回单杀 */ }
        process.kill(pid, 'SIGKILL');
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
    expect(alive).toBe(false); // 现状为 true：detached host 在主进程死后存活
  }, 30_000);
});
