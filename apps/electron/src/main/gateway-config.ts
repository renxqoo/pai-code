import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { serializeGatewayConfig, type RelayConfig } from '@x3code/contracts';

/**
 * agentDir/gateway.json 派生落盘与重载判定（fs 壳）：relay 配置的真相在
 * settings.json，本文件是 gateway spawn 期重生成的读口产物——序列化单一真相在
 * @x3code/contracts serializeGatewayConfig；gateway 只在启动期读入，differs
 * 即「需重启网关重载」信号（与 providers.json / models-config 同形）。
 */

/** 目标 gateway.json 与磁盘现存是否一致：不一致 = 需重启网关（配置在启动期读入）。 */
export function gatewayConfigDiffers(agentDir: string, relay: RelayConfig): boolean {
  const target = serializeGatewayConfig(relay);
  const path = join(agentDir, 'gateway.json');
  try {
    return !existsSync(path) || readFileSync(path, 'utf8') !== target;
  } catch {
    return true;
  }
}

export function writeGatewayConfig(agentDir: string, relay: RelayConfig): void {
  mkdirSync(agentDir, { recursive: true });
  // 原子写（tmp+rename）：直写的崩溃窗口产生截断档，gateway 启动读入即整档缺失
  const tempFile = join(agentDir, 'gateway.json.tmp');
  writeFileSync(tempFile, serializeGatewayConfig(relay));
  renameSync(tempFile, join(agentDir, 'gateway.json'));
}
