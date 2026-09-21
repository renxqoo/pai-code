// 红测替身：Electron 主进程的启动期替身。用真实 createHostProcess spawn 孤儿
// host 替身，等 host 就绪（pid 文件出现）后直接 process.exit(0)——模拟主进程在
// host 已 spawn、但尚未走到 before-quit 注册/优雅 dispose 的窗口内退出
// （启动期 Cmd+Q / SIGTERM / kill，before-quit 处理器注册在 whenReady 回调末尾，
// 位于 await runtime.start() 之后）。
import { existsSync } from 'node:fs';
import { createHostProcess } from '../../create-host-process';

const pidFile = process.env['ORPHAN_PID_FILE'] ?? '';
const hostScript = process.env['ORPHAN_HOST_SCRIPT'] ?? '';

createHostProcess({
  config: {
    bunPath: process.execPath,
    hubEntry: hostScript,
    agentDir: '/tmp',
    buildEnv: () => ({ ORPHAN_PID_FILE: pidFile }),
  },
  onFrame: () => undefined,
  onPhase: () => undefined,
  onDiagnostic: () => undefined,
});

const startedAt = Date.now();
while (!existsSync(pidFile)) {
  if (Date.now() - startedAt > 10_000) process.exit(2);
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 20);
  });
}
// 不 dispose 直接退出（主进程死亡）
process.exit(0);
