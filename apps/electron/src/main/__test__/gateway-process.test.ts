import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { staleGateway, startGatewayProcess, type GatewayProcess } from '../gateway-process';

function makeDeps(over: { gatewayEntry?: string | null } = {}) {
  return {
    bunPath: process.execPath,
    gatewayEntry: over.gatewayEntry ?? '/nonexistent-x-harness/cli.ts',
    agentDir: mkdtempSync(join(tmpdir(), 'gw-proc-test-')),
    hostExec: null,
    log: () => undefined,
  };
}

describe('gateway-process（Electron owner 面装配）', () => {
  let gateway: GatewayProcess | null = null;

  afterEach(async () => {
    await gateway?.stop();
    gateway = null;
  });

  test('gateway 入口缺失：stub 形态（command 拒而不崩、status stopped）', async () => {
    gateway = startGatewayProcess(makeDeps({ gatewayEntry: null }));
    expect(gateway.status()).toBe('stopped');
    const result = await gateway.command({ command: 'gw/status' });
    expect(result['success']).toBe(false);
    // 合成终局与线上 commandError 同形状（code + message）——管道单形状
    expect(result['error']).toEqual({ code: 'gateway-not-configured', message: 'gateway not configured' });
  });

  test('gateway 入口不存在：同样 stub 形态', async () => {
    gateway = startGatewayProcess(makeDeps());
    expect(gateway.connected()).toBe(false);
    const result = await gateway.command({ command: 'gw/pairing/start' });
    expect(result['success']).toBe(false);
  });

  /**
   * 症状回归（点击发起配对卡死 10s）：网关子进程中途退出/连接断开时，挂起命令必须
   * 立即以 gateway exited / gateway not connected 结案，不得空等到 10s 超时。
   */
  test('症状回归：网关子进程退出即拒挂起命令（不等 10s 超时）', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'gw-fixture-'));
    const entry = join(dir, 'fake-gateway.ts');
    // 接管 owner socket 后不回任何应答，随即自行退出——制造「响应永不到达」窗口
    writeFileSync(
      entry,
      [
        "import { createServer } from 'node:net';",
        "import { join } from 'node:path';",
        'const sock = join(process.argv[3], "gateway.sock");',
        'createServer((c) => { c.on("data", () => {}); setTimeout(() => process.exit(9), 400); }).listen(sock, () => {});',
      ].join('\n'),
    );
    const deps = makeDeps({ gatewayEntry: entry });
    gateway = startGatewayProcess(deps);
    const started = Date.now();
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 2_200); // 连上 owner socket 的窗口
    });
    const result = await gateway.command({ command: 'gw/status' });
    const elapsed = Date.now() - started;
    expect(result['success']).toBe(false);
    // 网关退出终局：reason 取 message（gateway exited / gateway not connected）
    expect(String((result['error'] as { message?: unknown })['message'])).toContain('gateway');
    expect(elapsed).toBeLessThan(6_000); // 10s 前已结案
  });

  test('staleGateway：无 pid 文件返回非 stale', () => {
    const dir = mkdtempSync(join(tmpdir(), 'gw-stale-'));
    expect(staleGateway(dir).stale).toBe(false);
  });

  test('staleGateway：残留死 pid 文件判 stale', () => {
    const dir = mkdtempSync(join(tmpdir(), 'gw-stale2-'));
    writeFileSync(join(dir, 'gateway.pid'), '999999999');
    expect(staleGateway(dir).stale).toBe(true);
  });

  test('onEvent 订阅可退订（无泄漏面）', () => {
    gateway = startGatewayProcess(makeDeps({ gatewayEntry: null }));
    let hit = 0;
    const off = gateway.onEvent(() => {
      hit += 1;
    });
    off();
    expect(hit).toBe(0);
  });
});
