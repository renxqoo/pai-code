/**
 * 端到端装置的 PC 侧栈（journey 用）：真 relay + 真 hub-gateway + 真 host-hub 子进程，
 * 与桌面端 Electron main 装配同一条链路（gw/* 经 owner unix socket，host 命令经 JSONL stdio）。
 */
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const X_HARNESS_ROOT = process.env['PAI_X_HARNESS_ROOT'] ?? new URL('../../../x-harness', import.meta.url).pathname;

/**
 * 权限确认往返探针的落盘文件名（相对线程 cwd）。
 *
 * 线程 cwd 必须是临时目录：确认放行后 write 会真的落盘，落进仓库就写坏了。
 */
export const PERMISSION_PROBE_FILE = 'permission-probe.txt';

export interface PcStack {
  relayPort: number;
  /** 内嵌形态下网关自起 relay 并提供 6 位码发现；外部形态需装置自备 relay。 */
  relayMode: 'embedded' | 'external';
  /** 发现端点的可达 origin（内嵌 relay 绑 0.0.0.0，须用其实际绑定地址而非 loopback）。 */
  relayOrigin: string;
  agentDir: string;
  ownerSocketPath: string;
  relayShutdown(): Promise<void>;
  gatewayShutdown(): Promise<void>;
  gatewayLog: string[];
}

export async function startPcStack(options: { relayKeyFingerprint?: string; relayUrl?: (port: number) => string; embedded?: boolean } = {}): Promise<PcStack> {
  const embedded = options.embedded === true;
  const { startRelay } = (await import(`${X_HARNESS_ROOT}/apps/hub-relay/src/main.ts`)) as {
    startRelay: (spec: { port: number; host: string; tokenSecret: string; singleInstance: boolean }) => Promise<{ server: { address(): { port: number } }; close(): Promise<void> }>;
  };
  const relay = embedded ? null : await startRelay({ port: 0, host: '127.0.0.1', tokenSecret: 'pai-relay-e2e-secret-32b!!', singleInstance: true });
  const relayPort = relay === null ? 0 : (relay.server.address() as { port: number }).port;

  const agentDir = await mkdtemp(join(tmpdir(), 'pai-relay-e2e-'));
  await mkdir(join(agentDir, 'devices'), { recursive: true });
  await writeFile(
    join(agentDir, 'gateway.json'),
    JSON.stringify({
      remoteEnabled: true,
      // 内嵌形态不下发 relayUrl：网关自起 relay 并挂 6 位码发现回调（外部 relay 无从按码反查网关）
      ...(embedded ? {} : { relayUrl: options.relayUrl?.(relayPort) ?? `ws://127.0.0.1:${relayPort}` }),
      relayKeyFingerprint: options.relayKeyFingerprint ?? 'fp-pai-relay-e2e',
    }),
    'utf8',
  );

  const gatewayLog: string[] = [];
  const { startGateway } = (await import(`${X_HARNESS_ROOT}/apps/hub-gateway/src/main.ts`)) as {
    startGateway: (spec: { agentDir: string; hostOverride: { command: string; args: string[]; env: Record<string, string> }; log?: (message: string) => void }) => Promise<{
      ownerServer: { socketPath: string };
      relayBinding: { mode: 'embedded' | 'external'; relayUrl: string; port: number | null };
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
        // 脚本游标按 worker 实例独立（每个新线程从头消费）。同一线程三轮：
        // ① 回话 ② bash 工具调用（edit-confirm 档不触发确认——bash 只在沙箱失败升级时问）
        // ③ write 工具调用（in-root Write 在 edit-confirm 档必问 → 覆盖 ui_request 往返）
        HUB_WORKER_SCRIPT: JSON.stringify([
          { reply: 'hello from scripted llm' },
          { toolCalls: [{ name: 'bash', input: JSON.stringify({ command: 'echo pai-relay-e2e' }) }] },
          { reply: 'tool finished' },
          { toolCalls: [{ name: 'write', input: JSON.stringify({ path: PERMISSION_PROBE_FILE, content: 'granted by device\n' }) }] },
          { reply: 'write finished' },
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
    relayMode: embedded ? 'embedded' : 'external',
    relayOrigin: new URL(gateway.relayBinding.relayUrl.replace(/^ws/, 'http')).origin,
    agentDir,
    ownerSocketPath: gateway.ownerServer.socketPath,
    gatewayLog,
    relayShutdown: () => relay?.close() ?? Promise.resolve(),
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