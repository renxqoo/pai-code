import { spawn, type ChildProcess } from 'node:child_process';

import { createFrameDecoder, encodeCommand } from '@paiapp/adapter';
import type { HostPhase, HostProcessPort, HostRuntimeConfig, HostCommandOutcome, HubFrame, PaiCommand } from '@paiapp/contracts';

/**
 * pai-cli host 进程管理：spawn、心跳监督（>hangAfterMs 无心跳判挂死）、
 * 挂死/崩溃重启（SIGKILL 进程组 → 重spawn → onRestart 恢复回调）、
 * 命令 request（id 关联 + 超时 + pending 上限）、优雅退出（stdin EOF → 等 exit → 兜底杀组）。
 *
 * 时序约定：phase starting →（首个心跳）ready →（挂死/退出）restarting → … → ready；
 * 连续失败超限 → failed（不再自愈，等待外部 dispose/重建）。
 */

export interface HostProcessDeps {
  config: HostRuntimeConfig;
  /** 非 response 帧交付（event/ui_request/heartbeat/hub_error/thread_died/subagent_*）。 */
  onFrame: (frame: HubFrame) => void;
  onPhase: (phase: HostPhase) => void;
  /** 重启后、等待首个心跳前的恢复钩子（如按注册表逐个 thread/resume）。 */
  onRestart?: () => Promise<void>;
  /** 注入时钟与节律（测试用）；缺省 1Hz 心跳 / 10s 挂死阈 / 30s 命令超时。 */
  timing?: HostProcessTiming;
  /** 诊断日志（stderr 摘要与监督事件）；缺省静默。 */
  onDiagnostic?: (message: string) => void;
}

export interface HostProcessTiming {
  /** 心跳判定间隔 ms。 */
  checkIntervalMs?: number;
  /** 超过该时长无心跳判挂死 ms。 */
  hangAfterMs?: number;
  /** 单命令应答超时 ms。 */
  requestTimeoutMs?: number;
  /** dispose 后等优雅退出的上限 ms。 */
  gracefulExitMs?: number;
  /** 重启退避序列 ms。 */
  restartBackoffMs?: readonly number[];
  /** 连续重启失败上限（达限转 failed）。 */
  maxConsecutiveRestarts?: number;
}

interface PendingRequest {
  resolve: (outcome: HostCommandOutcome) => void;
  timer: ReturnType<typeof setTimeout>;
}

const DEFAULT_TIMING = {
  checkIntervalMs: 1_000,
  hangAfterMs: 10_000,
  requestTimeoutMs: 30_000,
  gracefulExitMs: 5_000,
  restartBackoffMs: [0, 2_000, 5_000] as const,
  maxConsecutiveRestarts: 5,
} as const;

const PENDING_LIMIT = 1_024;
const STDERR_RING_LIMIT = 64 * 1_024;

export function createHostProcess(deps: HostProcessDeps): HostProcessPort {
  const timing = { ...DEFAULT_TIMING, ...deps.timing };
  const { config } = deps;

  let phase: HostPhase | null = null;
  let child: ChildProcess | null = null;
  let disposed = false;
  let exitingGracefully = false;
  let consecutiveFailures = 0;
  let watchdog: ReturnType<typeof setInterval> | null = null;
  let lastHeartbeatAt = 0;
  let spawnStartedAt = 0;
  let sawFirstHeartbeat = false;
  let restarting = false;
  let nextId = 1;
  let stderrRing = '';
  const pending = new Map<string, PendingRequest>();
  const frameListeners = new Set<(frame: HubFrame) => void>();
  const phaseListeners = new Set<(p: HostPhase) => void>();

  const emitFrame = (frame: HubFrame): void => {
    deps.onFrame(frame);
    for (const listener of frameListeners) listener(frame);
  };

  const setPhase = (next: HostPhase): void => {
    if (phase === next) return;
    phase = next;
    deps.onPhase(next);
    for (const listener of phaseListeners) listener(next);
  };

  const note = (message: string): void => {
    deps.onDiagnostic?.(message);
  };

  const failAllPending = (error: string): void => {
    for (const entry of pending.values()) {
      clearTimeout(entry.timer);
      entry.resolve({ ok: false, error });
    }
    pending.clear();
  };

  const killGroup = (): void => {
    const target = child;
    child = null;
    if (target?.pid === undefined) return;
    try {
      if (process.platform === 'win32') {
        target.kill();
      } else {
        process.kill(-target.pid, 'SIGKILL');
      }
    } catch {
      // 进程已死：无操作
    }
  };

  const startWatchdog = (): void => {
    if (watchdog !== null) return;
    watchdog = setInterval(() => {
      if (disposed || restarting || exitingGracefully) return;
      if (!sawFirstHeartbeat) return;
      if (Date.now() - lastHeartbeatAt <= timing.hangAfterMs) return;
      note(`heartbeat stale >${timing.hangAfterMs}ms; restarting host`);
      void restart('hang');
    }, timing.checkIntervalMs);
  };

  const spawnHost = (): void => {
    setPhase('starting');
    sawFirstHeartbeat = false;
    spawnStartedAt = Date.now();
    lastHeartbeatAt = spawnStartedAt;
    const env: Record<string, string> = { ...process.env, ...config.buildEnv(), PI_CODING_AGENT_DIR: config.agentDir };
    const proc = spawn(config.bunPath, [config.hubEntry], {
      cwd: config.cwd ?? process.cwd(),
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
      // POSIX 进程组：杀组能带走全部 worker 孙进程
      detached: process.platform !== 'win32',
    });
    child = proc;
    stderrRing = '';

    // 流级错误兜底：host 崩溃瞬间的 EPIPE 不允许击穿主进程
    proc.stdin?.on('error', (error) => note(`stdin_error:${error.message}`));
    proc.stdout?.on('error', (error) => note(`stdout_error:${error.message}`));
    proc.stderr?.on('error', (error) => note(`stderr_error:${error.message}`));

    proc.stdout?.setEncoding('utf8');
    const decoder = createFrameDecoder((frame) => {
      if (frame.type === 'response') {
        const responseId = frame.id;
        if (responseId === undefined) return;
        const entry = pending.get(responseId);
        if (entry === undefined) return;
        pending.delete(responseId);
        clearTimeout(entry.timer);
        entry.resolve(frame.success ? { ok: true, data: frame.data } : { ok: false, error: frame.error ?? 'command_failed' });
        return;
      }
      if (frame.type === 'heartbeat') {
        lastHeartbeatAt = Date.now();
        if (!sawFirstHeartbeat) {
          sawFirstHeartbeat = true;
          consecutiveFailures = 0;
          setPhase('ready');
        }
        return;
      }
      emitFrame(frame);
    }, {
      onDropped: (reason) => note(`frame_dropped:${reason}`),
    });
    proc.stdout?.on('data', (chunk: string) => decoder.push(chunk));
    proc.stdout?.on('end', () => decoder.finish());

    proc.stderr?.setEncoding('utf8');
    proc.stderr?.on('data', (chunk: string) => {
      stderrRing = (stderrRing + chunk).slice(-STDERR_RING_LIMIT);
    });

    proc.on('error', (error) => {
      note(`spawn_error:${error.message}`);
      if (disposed) return;
      if (child === proc) child = null;
      failAllPending('host_unavailable');
      setPhase('failed');
    });

    proc.on('exit', (code, signal) => {
      note(`host_exit:code=${code ?? 'null'}:signal=${signal ?? 'null'}`);
      if (disposed || exitingGracefully) return;
      // 只对"当前进程"的意外退出重启；重启中被杀旧进程的退出事件不级联
      if (child !== proc) return;
      failAllPending('host_restarting');
      void restart('exit');
    });

    startWatchdog();
  };

  const restart = async (cause: string): Promise<void> => {
    if (restarting || disposed) return;
    restarting = true;
    consecutiveFailures += 1;
    note(`restart:cause=${cause}:attempt=${consecutiveFailures}`);
    if (consecutiveFailures > timing.maxConsecutiveRestarts) {
      killGroup();
      failAllPending('host_failed');
      setPhase('failed');
      restarting = false;
      return;
    }
    setPhase('restarting');
    killGroup();
    failAllPending('host_restarting');
    const backoff = timing.restartBackoffMs[Math.min(consecutiveFailures - 1, timing.restartBackoffMs.length - 1)] ?? 0;
    if (backoff > 0) await delay(backoff);
    if (disposed) {
      restarting = false;
      return;
    }
    spawnHost();
    restarting = false;
    // 恢复钩子（resume 会话）在 spawn 后立即执行；命令会排队直到 worker 就绪
    try {
      await deps.onRestart?.();
    } catch (error) {
      note(`restart_hook_failed:${errorMessage(error)}`);
    }
  };

  spawnHost();

  return {
    get phase(): HostPhase {
      return phase ?? 'starting';
    },
    request(command: PaiCommand, timeoutMs?: number): Promise<HostCommandOutcome> {
      if (disposed) return Promise.resolve({ ok: false, error: 'host_disposed' });
      if (pending.size >= PENDING_LIMIT) return Promise.resolve({ ok: false, error: 'busy' });
      const id = String(nextId++);
      const proc = child;
      const stdin = proc?.stdin;
      if (stdin === null || stdin === undefined || proc === null) {
        return Promise.resolve({ ok: false, error: 'host_not_running' });
      }
      return new Promise((resolve) => {
        const timer = setTimeout(() => {
          pending.delete(id);
          resolve({ ok: false, error: 'timeout' });
        }, timeoutMs ?? timing.requestTimeoutMs);
        pending.set(id, { resolve, timer });
        stdin.write(encodeCommand(command, id), (error) => {
          if (error === undefined || error === null) return;
          const entry = pending.get(id);
          if (entry === undefined) return;
          pending.delete(id);
          clearTimeout(entry.timer);
          resolve({ ok: false, error: 'write_failed' });
        });
      });
    },
    onFrame(cb: (frame: HubFrame) => void): () => void {
      frameListeners.add(cb);
      return () => {
        frameListeners.delete(cb);
      };
    },
    onPhase(cb: (phase: HostPhase) => void): () => void {
      phaseListeners.add(cb);
      return () => {
        phaseListeners.delete(cb);
      };
    },
    async restart(reason: string): Promise<void> {
      if (disposed) return;
      note(`restart:manual:${reason}`);
      await restart(`manual:${reason}`);
    },
    async dispose(): Promise<void> {
      if (disposed) return;
      disposed = true;
      if (watchdog !== null) {
        clearInterval(watchdog);
        watchdog = null;
      }
      failAllPending('host_disposed');
      const proc = child;
      if (proc === null) return;
      exitingGracefully = true;
      await new Promise<void>((resolve) => {
        const finishTimer = setTimeout(() => {
          killGroup();
          resolve();
        }, timing.gracefulExitMs);
        proc.on('exit', () => {
          clearTimeout(finishTimer);
          resolve();
        });
        // 优雅停机协议：stdin EOF → host 落盘退出
        proc.stdin?.end();
      });
      child = null;
    },
    diagnostics(): { stderrTail: string } {
      return { stderrTail: stderrRing };
    },
  } satisfies HostProcessPort & { diagnostics(): { stderrTail: string } };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
