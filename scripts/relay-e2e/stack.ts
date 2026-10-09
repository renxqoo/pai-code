/**
 * 端到端装置的 PC 侧栈（journey 用）：真 relay + 真 hub-gateway + 真 host-hub 子进程，
 * 与桌面端 Electron main 装配同一条链路（gw/* 经 owner unix socket，host 命令经 JSONL stdio）。
 */
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const X_HARNESS_ROOT = process.env['PAI_X_HARNESS_ROOT'] ?? new URL('../../../x-harness', import.meta.url).pathname;

export interface PcStack {
  relayPort: number;
  agentDir: string;
  ownerSocketPath: string;
  relayShutdown(): Promise<void>;
  gatewayShutdown(): Promise<void>;
  gatewayLog: string[];
}

export async function startPcStack(options: { relayKeyFingerprint?: string; relayUrl?: (port: number) => string } = {}): Promise<PcStack> {
  const { startRelay } = (await import(`${X_HARNESS_ROOT}/apps/hub-relay/src/main.ts`)) as {
    startRelay: (spec: { port: number; host: string; tokenSecret: string; singleInstance: boolean }) => Promise<{ server: { address(): { port: number } }; close(): Promise<void> }>;
  };
  const relay = await startRelay({ port: 0, host: '127.0.0.1', tokenSecret: 'pai-relay-e2e-secret-32b!!', singleInstance: true });
  const relayPort = (relay.server.address() as { port: number }).port;

  const agentDir = await mkdtemp(join(tmpdir(), 'pai-relay-e2e-'));
  await mkdir(join(agentDir, 'devices'), { recursive: true });
  await writeFile(
    join(agentDir, 'gateway.json'),
    JSON.stringify({
      remoteEnabled: true,
      relayUrl: options.relayUrl?.(relayPort) ?? `ws://127.0.0.1:${relayPort}`,
      relayKeyFingerprint: options.relayKeyFingerprint ?? 'fp-pai-relay-e2e',
    }),
    'utf8',
  );

  const gatewayLog: string[] = [];
  const { startGateway } = (await import(`${X_HARNESS_ROOT}/apps/hub-gateway/src/main.ts`)) as {
    startGateway: (spec: { agentDir: string; hostOverride: { command: string; args: string[]; env: Record<string, string> }; log?: (message: string) => void }) => Promise<{
      ownerServer: { socketPath: string };
      relayLink: { connected(): boolean } | null;
      stop(): Promise<void>;
    }>;
  };
  const hostEntry = join(X_HARNESS_ROOT, 'apps/host-hub/src/host/cli.ts');
  const gateway = await startGateway({
    agentDir,
    hostOverride: {
      command: process.execPath,
      args: [hostEntry],
      env: {
        HUB_WORKER_PROVIDER: 'script',
        // 第 2 轮起发一个 bash 工具调用：覆盖工具行渲染 + 权限对话框往返（edit-confirm 档）
        HUB_WORKER_SCRIPT: JSON.stringify([
          { reply: 'hello from scripted llm' },
          { toolCalls: [{ name: 'bash', input: JSON.stringify({ command: 'echo pai-relay-e2e' }) }] },
          { reply: 'tool finished' },
        ]),
        HUB_SKILLS_MIGRATION: '0',
        HUB_AGENTS_MIGRATION: '0',
      },
    },
    log: (message: string) => {
      gatewayLog.push(message);
      if (process.env['PAI_E2E_VERBOSE'] === '1') process.stderr.write(`[gw] ${message}\n`);
    },
  });

  for (let i = 0; i < 150; i++) {
    await sleep(200);
    if (gateway.relayLink?.connected() === true) break;
  }
  if (gateway.relayLink?.connected() !== true) throw new Error('gateway relay link never connected');

  return {
    relayPort,
    agentDir,
    ownerSocketPath: gateway.ownerServer.socketPath,
    gatewayLog,
    relayShutdown: () => relay.close(),
    gatewayShutdown: () => gateway.stop(),
  };
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export async function waitFor<T>(label: string, probe: () => T | null | undefined | false, timeoutMs = 30_000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const hit = probe();
    if (hit !== null && hit !== undefined && hit !== false) return hit;
    if (Date.now() > deadline) throw new Error(`wait timeout: ${label}`);
    await sleep(100);
  }
}