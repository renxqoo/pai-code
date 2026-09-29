/**
 * gateway 进程管理（桌面 App 接入 remote-access）：spawn hub-gateway 守护进程 +
 * owner unix socket 客户端（JSONL L2 帧）。
 *
 * 形态：Electron 主进程是 gateway 的生命周期 owner（随 app 启停）；host-hub 由
 * gateway 唯一持有（stdio 独占）——桌面 UI 与手机同经 gateway 的命令/事件面。
 * hostOverride 指向桌面既有的 hub 二进制解析链（bunPath+hubEntry），agentDir 共享。
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { connect, type Socket } from 'node:net';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface OwnerFrame {
  kind: string;
  streamId?: string;
  seq?: number;
  body?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface GatewayProcessDeps {
  /** bun 可执行（spawn hub-gateway CLI 的运行时——桌面既有 bunPath 解析链产物）。 */
  bunPath: string;
  /** gateway CLI 入口（hub-paths resolveGatewayEntry 解析链产物）；null = 未配置（面板显示引导）。 */
  gatewayEntry: string | null;
  /** 共享 agentDir（host-hub 与 gateway 同一数据根）。 */
  agentDir: string;
  /** host 启动命令（Electron 既有 hub 解析链的产物——gateway hostOverride 用）。 */
  hostExec: { command: string; args: string[] } | null;
  log(message: string): void;
}

export interface PendingOwnerCommand {
  resolve(body: Record<string, unknown>): void;
  timer: ReturnType<typeof setTimeout>;
}

export interface GatewayProcess {
  /** owner 命令（gw/* 族 + host 直通命令——gateway judgeHostCommand owner 全权）。 */
  command(spec: { command: string; args?: Record<string, unknown>; timeoutMs?: number }): Promise<Record<string, unknown>>;
  /** 事件流订阅（gateway 扇出的 L2 event 帧——host 生命周期/设备事件）。 */
  onEvent(listener: (frame: OwnerFrame) => void): () => void;
  /** socket 就绪面（连接失败重试的时序依据）。 */
  connected(): boolean;
  status(): 'stopped' | 'starting' | 'running';
  stop(): Promise<void>;
}

const OWNER_CONNECT_TIMEOUT_MS = 8_000;
const COMMAND_DEFAULT_TIMEOUT_MS = 10_000;

export function startGatewayProcess(deps: GatewayProcessDeps): GatewayProcess {
  const log = (message: string): void => deps.log(message);
  /** 拒挂起命令：响应永不到达（子进程退出/连接断开），立即结案而非空等超时。 */
  const failPending = (reason: string): void => {
    for (const waiter of pending.values()) {
      clearTimeout(waiter.timer);
      waiter.resolve({ id: '', command: '', success: false, error: reason });
    }
    pending.clear();
  };
  let child: ChildProcess | null = null;
  let socket: Socket | null = null;
  let state: 'stopped' | 'starting' | 'running' = 'stopped';
  let buffer = '';
  let ownerSeq = 0;
  const pending = new Map<string, PendingOwnerCommand>();
  const listeners = new Set<(frame: OwnerFrame) => void>();

  const socketPath = join(deps.agentDir, 'gateway.sock');
  const gatewayEntry = deps.gatewayEntry;
  if (gatewayEntry === null || !existsSync(gatewayEntry)) {
    log('gateway_entry_missing');
    state = 'stopped';
    return {
      command: () => Promise.resolve({ id: '', command: '', success: false, error: 'gateway not configured' }),
      onEvent: () => () => undefined,
      connected: () => false,
      status: () => 'stopped',
      stop: () => Promise.resolve(),
    };
  }

  // spawn（hostOverride 携桌面 hub 解析链——gateway 的 host 与桌面共享同一二进制源；
  // gateway.json 落 agentDir 由 gateway 自读——env 不带配置）
  state = 'starting';
  child = spawn(deps.bunPath, [gatewayEntry, '--agent-dir', deps.agentDir, ...(deps.hostExec !== null ? ['--host-command', JSON.stringify(deps.hostExec)] : [])], {
    env: { ...process.env, HUB_AGENT_DIR: deps.agentDir } as Record<string, string>,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout?.on('data', (chunk: Buffer) => {
    for (const line of chunk.toString('utf8').split('\n')) {
      if (line.trim().length > 0) log(`gw: ${line.slice(0, 200)}`);
    }
  });
  child.stderr?.on('data', (chunk: Buffer) => {
    for (const line of chunk.toString('utf8').split('\n')) {
      if (line.trim().length > 0) log(`gw-err: ${line.slice(0, 200)}`);
    }
  });
  child.on('exit', (code) => {
    log(`gateway_exit:${code ?? 'unknown'}`);
    state = 'stopped';
    socket?.destroy();
    socket = null;
    failPending('gateway exited');
  });

  const dispatchFrame = (frame: OwnerFrame): void => {
    if (frame.kind === 'response') {
      const body = (frame.body ?? {}) as { id?: string };
      const waiter = typeof body.id === 'string' ? pending.get(body.id) : undefined;
      if (waiter !== undefined) {
        pending.delete(body.id as string);
        clearTimeout(waiter.timer);
        waiter.resolve(frame.body as Record<string, unknown>);
      }
      return;
    }
    for (const listener of listeners) listener(frame);
  };

  const connectOwner = (): void => {
    if (state === 'stopped') return;
    const s: Socket = connect(socketPath);
    const timer = setTimeout(() => {
      s.destroy();
    }, OWNER_CONNECT_TIMEOUT_MS);
    s.on('connect', () => {
      clearTimeout(timer);
      socket = s;
      state = 'running';
      log('gateway_owner_connected');
    });
    s.on('data', (chunk: Buffer) => {
      buffer += chunk.toString('utf8');
      let index = buffer.indexOf('\n');
      while (index >= 0) {
        const line = buffer.slice(0, index);
        buffer = buffer.slice(index + 1);
        if (line.trim().length > 0) {
          try {
            dispatchFrame(JSON.parse(line) as OwnerFrame);
          } catch {
            // 非帧行：跳过（gateway 日志不进 owner socket——此路径仅残帧）
          }
        }
        index = buffer.indexOf('\n');
      }
    });
    s.on('close', () => {
      if (socket === s) {
        socket = null;
        state = child?.exitCode === null ? 'starting' : 'stopped';
        failPending('gateway not connected');
        setTimeout(connectOwner, 1_500);
      }
    });
    s.on('error', () => {
      clearTimeout(timer);
      s.destroy();
    });
  };
  // gateway 启动（owner socket listen）有时差——轮拨
  setTimeout(connectOwner, 1_200);

  return {
    command(spec) {
      return new Promise((resolve) => {
        if (socket === null) {
          resolve({ id: '', command: spec.command, success: false, error: 'gateway not connected' });
          return;
        }
        ownerSeq += 1;
        const id = `o${ownerSeq}`;
        const timer = setTimeout(() => {
          pending.delete(id);
          resolve({ id, command: spec.command, success: false, error: 'timeout' });
        }, spec.timeoutMs ?? COMMAND_DEFAULT_TIMEOUT_MS);
        pending.set(id, { resolve, timer });
        socket.write(`${JSON.stringify({ kind: 'command', streamId: 'owner', seq: ownerSeq, body: { command: spec.command, id, args: spec.args ?? {} } })}\n`);
      });
    },
    onEvent(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    connected: () => socket !== null,
    status: () => state,
    async stop() {
      state = 'stopped';
      socket?.destroy();
      socket = null;
      failPending('gateway stopped');
      if (child?.exitCode === null) {
        const dying = child;
        await new Promise<void>((resolve) => {
          const killTimer = setTimeout(() => {
            dying.kill('SIGKILL');
            resolve();
          }, 3_000);
          dying.once('exit', () => {
            clearTimeout(killTimer);
            resolve();
          });
          dying.kill('SIGTERM');
        });
      }
      child = null;
    },
  };
}

/** gateway 残留探测（pid 活体检查——上次异常退出的 socket 残留清理判据）。 */
export function staleGateway(agentDir: string): { stale: boolean; pid: number | null } {
  const pidFile = join(agentDir, 'gateway.pid');
  if (!existsSync(pidFile)) return { stale: false, pid: null };
  try {
    const pid = Number.parseInt(readFileSync(pidFile, 'utf8').trim(), 10);
    if (!Number.isFinite(pid)) return { stale: true, pid: null };
    process.kill(pid, 0);
    return { stale: false, pid };
  } catch {
    return { stale: true, pid: null };
  }
}
