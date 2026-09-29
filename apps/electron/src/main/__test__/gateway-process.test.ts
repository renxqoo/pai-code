import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { staleGateway, startGatewayProcess, type GatewayProcess } from '../gateway-process';

function makeDeps(over: { xHarnessRoot?: string | null } = {}) {
  return {
    bunPath: process.execPath,
    xHarnessRoot: over.xHarnessRoot ?? '/nonexistent-x-harness',
    agentDir: mkdtempSync(join(tmpdir(), 'gw-proc-test-')),
    gatewayConfig: null,
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

  test('x-harness 根缺失：stub 形态（command 拒而不崩、status stopped）', async () => {
    gateway = startGatewayProcess(makeDeps({ xHarnessRoot: null }));
    expect(gateway.status()).toBe('stopped');
    const result = await gateway.command({ command: 'gw/status' });
    expect(result['success']).toBe(false);
    expect(result['error']).toBe('gateway not configured');
  });

  test('x-harness 入口不存在：同样 stub 形态', async () => {
    gateway = startGatewayProcess(makeDeps());
    expect(gateway.connected()).toBe(false);
    const result = await gateway.command({ command: 'gw/pairing/start' });
    expect(result['success']).toBe(false);
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
    gateway = startGatewayProcess(makeDeps({ xHarnessRoot: null }));
    let hit = 0;
    const off = gateway.onEvent(() => {
      hit += 1;
    });
    off();
    expect(hit).toBe(0);
  });
});
