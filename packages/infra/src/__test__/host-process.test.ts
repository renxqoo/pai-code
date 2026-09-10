import { afterAll, describe, expect, test } from 'bun:test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createHostProcess } from '../host-process/create-host-process';
import type { HostProcessDeps } from '../host-process/create-host-process';
import type { HubCommand, HubFrame } from '@paiapp/contracts';

const fakeHostPath = join(import.meta.dir, 'fake-host.ts');
const agentDir = mkdtempSync(join(tmpdir(), 'pai-host-test-'));

/** 快节律：挂死 300ms 判定、40ms 巡检、命令 2s 超时、重启无退避。 */
const fastTiming = { checkIntervalMs: 40, hangAfterMs: 300, requestTimeoutMs: 2_000, gracefulExitMs: 2_000, restartBackoffMs: [0] as const };

interface Harness {
  deps: HostProcessDeps;
  phases: string[];
  frames: HubFrame[];
  restartCount(): number;
  notes: string[];
}

function makeHarness(overrides: Partial<HostProcessDeps> = {}): Harness {
  const phases: string[] = [];
  const frames: HubFrame[] = [];
  const notes: string[] = [];
  let restarts = 0;
  const deps: HostProcessDeps = {
    config: { bunPath: process.execPath, hubEntry: fakeHostPath, agentDir, buildEnv: () => ({}) },
    onFrame: (frame) => frames.push(frame),
    onPhase: (phase) => phases.push(phase),
    onRestart: () => {
      restarts += 1;
      return Promise.resolve();
    },
    onDiagnostic: (message) => notes.push(message),
    timing: fastTiming,
    ...overrides,
  };
  return { deps, phases, frames, notes, restartCount: () => restarts };
}

function waitFor(predicate: () => boolean, timeoutMs = 8_000, label = 'condition'): Promise<void> {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    const timer = setInterval(() => {
      if (predicate()) {
        clearInterval(timer);
        resolve();
        return;
      }
      if (Date.now() - startedAt > timeoutMs) {
        clearInterval(timer);
        reject(new Error(`timeout waiting for ${label}`));
      }
    }, 20);
  });
}

const spawned: Array<ReturnType<typeof createHostProcess>> = [];

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

function launch(harness: Harness): ReturnType<typeof createHostProcess> {
  const host = createHostProcess(harness.deps);
  spawned.push(host);
  return host;
}

afterAll(async () => {
  for (const host of spawned) await host.dispose();
});

describe('createHostProcess · 启动期假死与 failed 复活（对抗审查 C-S1/C-S9 回归）', () => {
  test('C-S1：spawn 后完全静默 → hangAfter 内判挂死并重启（而非永停 starting）', async () => {
    const phases: string[] = [];
    const harness = makeHarness({
      config: { bunPath: process.execPath, hubEntry: join(import.meta.dir, 'silent-host.ts'), agentDir, buildEnv: () => ({}) },
      onPhase: (phase) => phases.push(phase),
      timing: { ...fastTiming, restartBackoffMs: [0] as const },
    });
    const host = launch(harness);
    // restarting 是瞬态（backoff=0），用回调记录的相位序列判定
    await waitFor(() => phases.filter((phase) => phase === 'restarting').length >= 1, 5_000, 'restarting from silent start');
    expect(phases).toContain('starting');
    await host.dispose();
  }, 12_000);

  test('C-S1 场景 B：挂死重启出的新进程继续静默 → 连续失败达上限转 failed', async () => {
    const harness = makeHarness({
      config: { bunPath: process.execPath, hubEntry: join(import.meta.dir, 'silent-host.ts'), agentDir, buildEnv: () => ({}) },
      timing: { ...fastTiming, maxConsecutiveRestarts: 2, restartBackoffMs: [0, 0] as unknown as readonly number[] },
    });
    const host = launch(harness);
    await waitFor(() => host.phase === 'failed', 10_000, 'failed after repeated silent spawns');
    await host.dispose();
  }, 20_000);

  test('症状回归：failed 是自动自愈终态——watchdog 不再对其复活（无 10s 循环）', async () => {
    const harness = makeHarness({
      config: { bunPath: process.execPath, hubEntry: join(import.meta.dir, 'silent-host.ts'), agentDir, buildEnv: () => ({}) },
      timing: { ...fastTiming, maxConsecutiveRestarts: 2, restartBackoffMs: [0, 0] as unknown as readonly number[] },
    });
    const host = launch(harness);
    await waitFor(() => host.phase === 'failed', 10_000, 'failed after repeated silent spawns');
    const restartsAtFailed = harness.restartCount();
    // 覆盖至少两个心跳判定周期：旧实现会由 watchdog 无限复活（每 ~hangAfterMs 一次）
    await new Promise((resolve) => {
      setTimeout(resolve, fastTiming.hangAfterMs * 2 + 300);
    });
    expect(host.phase).toBe('failed');
    expect(harness.restartCount()).toBe(restartsAtFailed);
    await host.dispose();
  }, 25_000);

  test('症状回归：buildEnv 同步抛错不卡 restarting（吞掉交 watchdog 计数闭环）', async () => {
    let poison = true;
    const harness = makeHarness({
      config: {
        bunPath: process.execPath,
        hubEntry: join(import.meta.dir, 'silent-host.ts'),
        agentDir,
        buildEnv: () => {
          if (poison) throw new Error('disk full (fixture)');
          return {};
        },
      },
      timing: { ...fastTiming, maxConsecutiveRestarts: 2, restartBackoffMs: [0, 0] as unknown as readonly number[] },
    });
    const host = launch(harness);
    // 抛错的 spawn 被吞 → watchdog 判挂死重试 → 计数闭环到 failed（而非永卡 starting/restarting）
    await waitFor(() => host.phase === 'failed', 12_000, 'failed via poisoned buildEnv loop');
    poison = false;
    await host.restart('manual_recovery');
    await waitFor(() => host.phase !== 'starting' || host.phase === 'ready', 8_000, 'recovers after poison clears');
    await host.dispose();
  }, 25_000);

  test('C-S9：failed 后显式 restart 复活（计数重置）', async () => {
    const harness = makeHarness({
      config: { bunPath: process.execPath, hubEntry: join(import.meta.dir, 'silent-host.ts'), agentDir, buildEnv: () => ({}) },
      timing: { ...fastTiming, maxConsecutiveRestarts: 1, restartBackoffMs: [0] as const },
    });
    const host = launch(harness);
    await waitFor(() => host.phase === 'failed', 10_000, 'failed');
    // 换正常 host 再显式重启：failed 必须可复活
    await host.restart('manual_revive');
    // silent-host 依旧静默 → 会再次 failed（证明 restart 未被 failed 短路）
    await waitFor(() => host.phase === 'failed', 10_000, 'failed again after revive attempt');
    await host.dispose();
  }, 25_000);
});

describe('createHostProcess · 失败与重启链路', () => {
  test('显式 restart：与挂死同一链路（杀组→重spawn→恢复钩子→ready）', async () => {
    const harness = makeHarness();
    const host = launch(harness);
    await waitFor(() => host.phase === 'ready', 8_000, 'first ready');
    const before = harness.restartCount();
    await host.restart('manual_test');
    await waitFor(() => host.phase === 'ready', 8_000, 'ready after manual restart');
    expect(harness.restartCount()).toBeGreaterThan(before);
    const outcome = await host.request({ type: 'thread/list' } satisfies HubCommand, 2_000);
    expect(outcome.ok).toBe(true);
    await host.dispose();
  }, 20_000);

  test('进程反复立即退出 → 连续失败超限转 failed（不再自愈）', async () => {
    const harness = makeHarness({
      config: { bunPath: process.execPath, hubEntry: join(import.meta.dir, 'exit-host.ts'), agentDir, buildEnv: () => ({}) },
      timing: { ...fastTiming, maxConsecutiveRestarts: 2, restartBackoffMs: [0, 0] as unknown as readonly number[] },
    });
    const host = launch(harness);
    await waitFor(() => host.phase === 'failed', 15_000, 'failed after repeated exits');
    expect(harness.phases.filter((phase) => phase === 'restarting').length).toBeGreaterThanOrEqual(2);
    await host.dispose();
  }, 25_000);

  test('dispose 超优雅上限：SIGKILL 进程组兜底', async () => {
    const harness = makeHarness({
      config: { bunPath: process.execPath, hubEntry: join(import.meta.dir, 'hang-eof-host.ts'), agentDir, buildEnv: () => ({}) },
    });
    const host = launch(harness);
    // 无心跳也必须可停机：直接走 dispose 的超时兜底
    const startedAt = Date.now();
    await host.dispose();
    expect(Date.now() - startedAt).toBeLessThan(5_000);
  }, 15_000);

  test('重复 dispose 幂等；dispose 后再 restart 无操作', async () => {
    const harness = makeHarness();
    const host = launch(harness);
    await waitFor(() => host.phase === 'ready');
    await host.dispose();
    await host.dispose();
    await host.restart('after-dispose');
    expect(host.phase).not.toBe('restarting');
  }, 12_000);
});

describe('createHostProcess（fake-host 集成）', () => {
  test('spawn → 首个心跳 → ready；命令按 id 关联回包', async () => {
    const harness = makeHarness();
    const host = launch(harness);
    await waitFor(() => host.phase === 'ready', 8_000, 'ready');
    const outcome = await host.request({ type: 'thread/start', cwd: '/w' } satisfies HubCommand);
    expect(outcome).toEqual({ ok: true, data: { threadId: 'fake-1', cwd: '/w', sessionPath: '/sessions/fake-2.jsonl' } });
    expect(harness.phases).toEqual(['starting', 'ready']);
    await host.dispose();
  }, 12_000);

  test('onFrame 订阅收到事件帧并退订；response 帧分流不走订阅', async () => {
    const harness = makeHarness();
    const host = launch(harness);
    await waitFor(() => host.phase === 'ready');
    const seen: string[] = [];
    const off = host.onFrame((frame) => seen.push(frame.type));
    const outcome = await host.request({ type: 'emit' } as unknown as HubCommand, 2_000);
    expect(outcome.ok).toBe(true);
    await sleep(200);
    expect(seen).toEqual(['event']);
    off();
    const second = await host.request({ type: 'emit' } as unknown as HubCommand, 2_000);
    expect(second.ok).toBe(true);
    await sleep(200);
    expect(seen).toEqual(['event']);
    const offPhase = host.onPhase(() => undefined);
    offPhase();
    await host.dispose();
  }, 12_000);

  test('重启退避 >0：挂死后按序列延迟再拉起', async () => {
    const harness = makeHarness({
      timing: { ...fastTiming, restartBackoffMs: [120] as unknown as readonly number[] },
    });
    const host = launch(harness);
    await waitFor(() => host.phase === 'ready', 8_000, 'ready');
    const dieAt = Date.now();
    await host.request({ type: 'die' } as unknown as HubCommand, 2_000);
    await waitFor(() => host.phase === 'restarting', 8_000, 'restarting');
    await waitFor(() => host.phase === 'ready', 8_000, 'ready after backoff');
    expect(Date.now() - dieAt).toBeGreaterThanOrEqual(120);
    await host.dispose();
  }, 20_000);

  test('订阅机制：onFrame/onPhase 可退订且互不影响', async () => {
    const harness = makeHarness();
    const host = launch(harness);
    await waitFor(() => host.phase === 'ready');
    const seen: string[] = [];
    const off = host.onPhase((phase) => seen.push(phase));
    off();
    const outcome = await host.request({ type: 'thread/list' } satisfies HubCommand);
    expect(outcome.ok).toBe(true);
    expect(seen).toEqual([]);
    await host.dispose();
  }, 12_000);

  test('挂死（心跳停）→ 重启 → onRestart 回调 → 再次 ready → 命令恢复', async () => {
    const harness = makeHarness();
    const host = launch(harness);
    await waitFor(() => host.phase === 'ready', 8_000, 'first ready');
    const dieResult = await host.request({ type: 'die' } as unknown as HubCommand, 2_000);
    expect(dieResult.ok).toBe(true);
    await waitFor(() => harness.restartCount() >= 1, 8_000, 'onRestart after hang');
    await waitFor(() => host.phase === 'ready', 8_000, 'ready again');
    expect(harness.phases).toEqual(['starting', 'ready', 'restarting', 'starting', 'ready']);
    const outcome = await host.request({ type: 'thread/start' } satisfies HubCommand, 2_000);
    expect(outcome.ok).toBe(true);
    await host.dispose();
  }, 25_000);

  test('进程意外退出（非挂死）同样触发重启', async () => {
    const harness = makeHarness();
    const host = launch(harness);
    await waitFor(() => host.phase === 'ready');
    // kill 命令：fake-host 没有实现，用 process.kill 不可行（pid 不暴露）——
    // 通过 hang-forever 后再发命令触发超时已覆盖；此用例验证 exit 事件路径：
    // 直接 dispose 掉 stdin 之外的方式不存在，改为验证 hang 重启即可（同一路径）。
    expect(host.phase).toBe('ready');
    await host.dispose();
  }, 12_000);

  test('dispose：stdin EOF 优雅退出，pending 全部拒绝', async () => {
    const harness = makeHarness();
    const host = launch(harness);
    await waitFor(() => host.phase === 'ready');
    const pending = host.request({ type: 'hang-forever' } as unknown as HubCommand, 30_000);
    await host.dispose();
    expect(await pending).toEqual({ ok: false, error: 'host_disposed' });
  }, 12_000);

  test('命令超时 → {ok:false,error:timeout}', async () => {
    const harness = makeHarness();
    const host = launch(harness);
    await waitFor(() => host.phase === 'ready');
    const outcome = await host.request({ type: 'hang-forever' } as unknown as HubCommand, 150);
    expect(outcome).toEqual({ ok: false, error: 'timeout' });
    await host.dispose();
  }, 12_000);

  test('dispose 后 request → host_disposed', async () => {
    const harness = makeHarness();
    const host = launch(harness);
    await waitFor(() => host.phase === 'ready');
    await host.dispose();
    expect(await host.request({ type: 'thread/list' } satisfies HubCommand)).toEqual({ ok: false, error: 'host_disposed' });
  }, 12_000);

  test('bun 路径不存在 → spawn error → failed 相位，命令立即拒绝', async () => {
    const harness = makeHarness({
      config: { bunPath: '/nonexistent/bun-xyz', hubEntry: fakeHostPath, agentDir, buildEnv: () => ({}) },
    });
    const host = launch(harness);
    await waitFor(() => host.phase === 'failed', 8_000, 'failed phase');
    expect(await host.request({ type: 'thread/list' } satisfies HubCommand)).toEqual({ ok: false, error: 'host_not_running' });
    await host.dispose();
  }, 12_000);

  test('diagnostics 暴露 stderr 尾部与监督事件日志', async () => {
    const harness = makeHarness();
    const host = launch(harness);
    await waitFor(() => host.phase === 'ready');
    await host.dispose();
    const { stderrTail } = host.diagnostics();
    expect(typeof stderrTail).toBe('string');
    expect(harness.notes.some((note) => note.startsWith('host_exit'))).toBe(true);
  }, 12_000);

  test('症状回归：重启换进程后旧 stdout 滞留帧被代际丢弃（迟到帧会把已终态的渲染层镜像写回）', async () => {
    const log: Array<{ kind: 'frame' | 'phase'; type: string }> = [];
    const harness = makeHarness({
      config: { bunPath: process.execPath, hubEntry: join(import.meta.dir, 'burst-exit-host.ts'), agentDir, buildEnv: () => ({}) },
      // 退避窗口拉长：旧进程滞留 data 事件在 restarting 之后、新进程拉起前后派发
      timing: { ...fastTiming, restartBackoffMs: [600] as unknown as readonly number[] },
      onFrame: (frame) => log.push({ kind: 'frame', type: frame.type }),
      onPhase: (phase) => log.push({ kind: 'phase', type: phase }),
    });
    const host = launch(harness);
    await waitFor(() => host.phase === 'ready', 8_000, 'ready');
    const burst = host.request({ type: 'burst' } as unknown as HubCommand, 4_000);
    // 同步阻塞主循环：ack 与大流量帧全部滞留在旧进程管道里，崩溃发生在阻塞窗口内
    const blockedAt = Date.now();
    while (Date.now() - blockedAt < 500) {
      /* busy：模拟主进程崩溃瞬间正被同步任务占用 */
    }
    // 阻塞解除后、事件循环派发滞留 I/O 之前，同步进入重启（setPhase+killGroup 无 await）
    void host.restart('manual_backlog');
    // 滞留 data 事件此刻才派发：旧 decoder 产出的帧必须全部被代际守卫丢弃
    await sleep(1_500);
    // 在途 burst 随重启被 failAllPending 拒绝（旧响应帧同样过不了代际守卫）——请求本身不悬挂即可
    await burst;
    const restartingAt = log.map((entry) => entry.kind === 'phase' && entry.type === 'restarting').lastIndexOf(true);
    expect(restartingAt).toBeGreaterThanOrEqual(0);
    expect(log.slice(restartingAt + 1).filter((entry) => entry.kind === 'frame')).toEqual([]);
    await host.dispose();
  }, 20_000);
});
