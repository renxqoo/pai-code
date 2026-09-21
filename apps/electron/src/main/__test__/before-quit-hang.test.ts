import { describe, expect, test } from 'bun:test';

/**
 * 退出链路回归（runner）：真实 index.ts 的驱动装置在子进程跑（mock electron +
 * 动态 import 的集成形态，见 before-quit-harness.ts）——装置对 index.ts 的模块
 * 加载不属于单测覆盖口径（Electron 装配入口），子进程隔离使聚合覆盖率不被
 * 「未走完的装配路径」稀释；断言以子进程退出码为门（任一场景红即非零）。
 */

describe('before-quit 退出链路（子进程驱动真实 index.ts）', () => {
  test('四场景全绿：装配失败 quit 兜底 / 控制组 / SIGTERM 停机链 / 窗口生命周期', () => {
    const result = Bun.spawnSync([process.execPath, 'test', './apps/electron/src/main/__test__/before-quit-harness.ts'], {
      cwd: process.cwd(),
      stdout: 'pipe',
      stderr: 'pipe',
      env: process.env,
    });
    if (result.exitCode !== 0) {
      process.stdout.write(result.stdout.toString());
      process.stderr.write(result.stderr.toString());
    }
    expect(result.exitCode).toBe(0);
  }, 60_000);
});
