import { afterEach, expect, test } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { gatewayConfigDiffers, writeGatewayConfig } from '../gateway-config';
import { serializeGatewayConfig } from '@paiapp/contracts';

/**
 * gateway.json 派生落盘回归（全局统一：settings.json 的 relay 是唯一真相，
 * 本文件是 gateway spawn 期重生成的读口产物——与 providers.json 同形）。
 */

const dirs: string[] = [];

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'pai-gateway-config-'));
  dirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const relay = { relayUrl: 'wss://relay.example.com', relayKeyFingerprint: 'fp-1' };

test('症状回归（配对必失败）：未配置 relayUrl 时写本地形态（remoteEnabled:false）且键齐全', () => {
  const dir = tempDir();
  writeGatewayConfig(dir, { relayUrl: '', relayKeyFingerprint: '' });
  const written = JSON.parse(readFileSync(join(dir, 'gateway.json'), 'utf8')) as Record<string, unknown>;
  expect(written).toEqual({ remoteEnabled: false, relayUrl: '', relayKeyFingerprint: '' });
});

test('已配置 relayUrl 时写远程形态（remoteEnabled:true），内容与 serializeGatewayConfig 逐字节一致', () => {
  const dir = tempDir();
  writeGatewayConfig(dir, relay);
  expect(readFileSync(join(dir, 'gateway.json'), 'utf8')).toBe(serializeGatewayConfig(relay));
});

test('原子写：目标目录不存在时自动建；重复写不残留临时文件', () => {
  const dir = join(tempDir(), 'nested', 'agent');
  writeGatewayConfig(dir, relay);
  writeGatewayConfig(dir, relay);
  expect(readFileSync(join(dir, 'gateway.json'), 'utf8')).toBe(serializeGatewayConfig(relay));
});

test('gatewayConfigDiffers：磁盘缺席/内容不同 → true（需重启网关重载）', () => {
  const dir = tempDir();
  expect(gatewayConfigDiffers(dir, relay)).toBe(true);
  writeGatewayConfig(dir, relay);
  expect(gatewayConfigDiffers(dir, relay)).toBe(false);
  expect(gatewayConfigDiffers(dir, { relayUrl: 'wss://other.example.com', relayKeyFingerprint: 'fp-1' })).toBe(true);
});
