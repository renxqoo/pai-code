import { afterAll, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { HostCommandOutcome, HostPhase, HostProcessPort, HubFrame, PaiCommand } from '@paiapp/contracts';

import { createApiRoutes } from '../api-routes';
import { createAgentDefinitionsStore } from '../agent-definitions-store';
import { createFileSettings, type ProviderKeyStore } from '../file-settings';
import { createPaiRuntime } from '../pai-runtime';
import { createRuntimeMonitor } from '../runtime-monitor/create-runtime-monitor';

/**
 * session 通路契约回归（host-hub 协议面）：
 * - prompt 受理窗口竞态：hub 判定 pendingSends>0 ∨ streaming 时回
 *   'streamingBehavior required'——app 侧 streaming 状态来自事件流天然滞后，
 *   无显式 streamingBehavior 的 prompt 恰一次自动降级重试（补 followUp），
 *   重试仍败才上抛；显式 streamingBehavior 不重试。
 * - entries 游标失效（分支变化/重恢复，hub 文案 invalid since cursor）→ 全量兜底。
 * - setThinking 四档词表校验；subagent/steer agentId 寻址；bash 结果对象收窄。
 */

const keyStore: ProviderKeyStore = {
  encryptionAvailable: false,
  getKey: () => null,
  setKey: () => undefined,
  keyNames: [],
};

/** 可编程 fake host：按命令类型回放（首答可注入失败再成功）。 */
function makeProgrammableHost(reply: (command: PaiCommand, callIndexOfType: number) => HostCommandOutcome): { port: HostProcessPort; sent: PaiCommand[] } {
  const sent: PaiCommand[] = [];
  const counts = new Map<string, number>();
  const port: HostProcessPort = {
    get phase(): HostPhase {
      return 'ready';
    },
    request: (command: PaiCommand): Promise<HostCommandOutcome> => {
      const index = counts.get(command.type) ?? 0;
      counts.set(command.type, index + 1);
      sent.push(command);
      return Promise.resolve(reply(command, index));
    },
    onFrame: (_cb: (frame: HubFrame) => void) => () => undefined,
    onPhase: () => () => undefined,
    restart: () => Promise.resolve(),
    dispose: () => Promise.resolve(),
    diagnostics: () => ({ stderrTail: '', restartCount: 0, lastRestartCause: null, lastRestartAt: null }),
  };
  return { port, sent };
}

const dirs: string[] = [];

async function makeRoutes(
  reply: (command: PaiCommand, callIndexOfType: number) => HostCommandOutcome,
  logSink?: string[],
  auditSink?: string[],
) {
  const work = mkdtempSync(join(tmpdir(), 'pai-session-route-'));
  dirs.push(work);
  const agentDir = join(work, 'agent');
  mkdirSync(join(agentDir, 'sessions'), { recursive: true });
  writeFileSync(join(work, 'cli.js'), '');
  const host = makeProgrammableHost(reply);
  const runtime = createPaiRuntime({
    paths: {
      userDataDir: work,
      agentDir,
      registryDb: join(work, 'r.sqlite'),
      settingsFile: join(work, 's.json'),
      providerKeysFile: join(work, 'k.json'),
      logFile: join(work, 'l.log'),
    },
    keyStore,
    providers: () => [],
    idleRecycleMinutes: () => 5,
    hubPaths: () => ({ bunPath: 'bun', hubEntry: join(work, 'cli.js') }),
    logger: { log: (message) => (logSink !== undefined ? logSink.push(message) : undefined) },
    emit: () => undefined,
    createHost: () => host.port,
  });
  await runtime.start();
  const routes = createApiRoutes({
    runtime,
    settings: createFileSettings(join(work, 'settings.json'), keyStore),
    keyStore,
    audit: (message) => (auditSink !== undefined ? auditSink.push(message) : undefined),
    agentDefinitions: createAgentDefinitionsStore(join(work, 'home')),
    agentDir,
    revealPath: () => undefined,
    pickDirectory: () => Promise.resolve(null),
    exportDiagnosticsBundle: () => work,
    monitor: createRuntimeMonitor({ host: () => null, hub: () => null, appMetrics: () => ({ rssBytes: null, cpuPercent: null }), systemMemory: () => ({ totalBytes: null, availableBytes: null }), idleRecycleMinutes: () => 5, appVersion: () => 'test' }),
  });
  return { routes, runtime, sent: host.sent, agentDir };
}

/** 落一行 live 会话（registry + 内存表；title 缺省「New conversation」让 autoTitle 可观察；
 *  sessionPath 缺省按 hub 布局拼路径，显式 null = 无会话文件空占位）。 */
function seedLiveSession(runtime: ReturnType<typeof createPaiRuntime>, threadId: string, agentDir: string, sessionPath?: string | null, title: string | null = null): string {
  const path = sessionPath !== undefined ? sessionPath : agentDir.length > 0 ? join(agentDir, 'sessions', threadId, 'events.jsonl') : null;
  return runtime.applyStartOutcome(threadId, '/w', path, title, 1, false).threadId;
}

describe('session/prompt 受理窗口竞态（症状：streaming 中发消息偶发失败）', () => {
  test('症状回归：线上不可观测——start/prompt 失败经 hub onCall 落诊断日志（hub_call_rejected，kind 不折平）', async () => {
    const logs: string[] = [];
    const { routes, runtime, agentDir } = await makeRoutes((command) => {
      if (command.type === 'prompt' || command.type === 'thread/start') return { ok: false, error: 'no dial' };
      return { ok: true, data: {} };
    }, logs);
    seedLiveSession(runtime, 't1', agentDir);
    const promptOutcome = (await routes.invoke('session/prompt', { threadId: 't1', message: 'hi' })) as { ok: boolean };
    expect(promptOutcome.ok).toBe(false);
    const startOutcome = (await routes.invoke('session/start', { cwd: '/tmp' })) as { ok: boolean };
    expect(startOutcome.ok).toBe(false);
    // 手工 session_*_rejected 已删（同一事实一套接口）：transport onCall 统一落
    // hub_call_rejected:<type>:<threadId>:<token>——kind/face/message 保留可 grep 签名
    expect(logs).toContain('hub_call_rejected:prompt:t1:transient:command_failed:no dial');
    expect(logs).toContain('hub_call_rejected:thread/start:-:transient:command_failed:no dial');
  });

  test("症状回归：'streamingBehavior required' 恰一次自动降级重试（补 followUp），重试成功不上抛", async () => {
    const { routes, runtime, agentDir, sent } = await makeRoutes((command, index) => {
      if (command.type === 'prompt') {
        // 首答按 hub 受理窗口判定拒绝；降级重试（followUp）放行
        if (index === 0) return { ok: false, error: { code: 'streaming_window', message: 'streamingBehavior required' } };
        return { ok: true, data: null };
      }
      return { ok: true, data: {} };
    });
    seedLiveSession(runtime, 't1', agentDir);
    const outcome = (await routes.invoke('session/prompt', { threadId: 't1', message: '继续' })) as { ok: boolean; error?: { kind: string; message?: string } };
    expect(outcome).toEqual({ ok: true, data: null });
    const prompts = sent.filter((command) => command.type === 'prompt');
    expect(prompts.length).toBe(2);
    // 重试命令补 streamingBehavior: 'followUp'，消息与线程不变
    expect(prompts[0]).toMatchObject({ streamingBehavior: undefined });
    expect(prompts[1]).toMatchObject({ type: 'prompt', threadId: 't1', message: '继续', streamingBehavior: 'followUp' });
  });

  test('重试仍败 → 上抛 hub error（不无限重试）', async () => {
    const { routes, runtime, agentDir, sent } = await makeRoutes((command) => {
      if (command.type === 'prompt') return { ok: false, error: { code: 'streaming_window', message: 'streamingBehavior required' } };
      return { ok: true, data: {} };
    });
    seedLiveSession(runtime, 't1', agentDir);
    const outcome = (await routes.invoke('session/prompt', { threadId: 't1', message: '继续' })) as { ok: boolean; error?: { kind: string; message?: string } };
    expect(outcome).toEqual({ ok: false, error: { kind: 'streaming_window', message: 'streamingBehavior required' } });
    expect(sent.filter((command) => command.type === 'prompt').length).toBe(2);
  });

  test('显式 streamingBehavior 不重试（用户已裁决 steer/followUp）；其他失败不触发重试', async () => {
    const explicit = await makeRoutes((command) => {
      if (command.type === 'prompt') return { ok: false, error: { code: 'streaming_window', message: 'streamingBehavior required' } };
      return { ok: true, data: {} };
    });
    seedLiveSession(explicit.runtime, 't1', explicit.agentDir);
    const steered = (await explicit.routes.invoke('session/prompt', { threadId: 't1', message: '改需求', streamingBehavior: 'steer' })) as { ok: boolean; error?: { kind: string; message?: string } };
    expect(steered).toEqual({ ok: false, error: { kind: 'streaming_window', message: 'streamingBehavior required' } });
    expect(explicit.sent.filter((command) => command.type === 'prompt').length).toBe(1);

    const other = await makeRoutes((command) => {
      if (command.type === 'prompt') return { ok: false, error: { code: 'unknown_thread', message: 'Unknown threadId' } };
      return { ok: true, data: {} };
    });
    seedLiveSession(other.runtime, 't1', other.agentDir);
    const unknown = (await other.routes.invoke('session/prompt', { threadId: 't1', message: '继续' })) as { ok: boolean; error?: { kind: string; message?: string } };
    expect(unknown).toEqual({ ok: false, error: { kind: 'unknown_thread', message: 'Unknown threadId' } });
    expect(other.sent.filter((command) => command.type === 'prompt').length).toBe(1);
  });
});

describe('session/entries 游标域（症状：分支切换后增量窗口 stale 不自愈）', () => {
  test("症状回归：'invalid since cursor' → 全量兜底重拉（不带 since）", async () => {
    const full = { entries: [{ seq: 1, ts: 1, event: { type: 'user/message', turn: 0, step: 0, content: [{ type: 'text', text: 'hi' }] } }], leafSeq: 1, hasMore: false };
    const { routes, sent } = await makeRoutes((command, index) => {
      if (command.type === 'get_entries') {
        // 带游标的首次请求失效；兜底全量请求（index=1）成功
        if (index === 0) return { ok: false, error: { code: 'cursor_stale', message: 'invalid since cursor: 9' } };
        return { ok: true, data: full };
      }
      return { ok: true, data: {} };
    });
    const outcome = (await routes.invoke('session/entries', { threadId: 't1', since: 9 })) as {
      ok: boolean;
      data: { items: Array<{ kind: string }>; cursor: number | null };
    };
    expect(outcome.ok).toBe(true);
    expect(outcome.data.items.map((item) => item.kind)).toEqual(['user']);
    expect(outcome.data.cursor).toBe(1);
    const requests = sent.filter((command) => command.type === 'get_entries');
    expect(requests.length).toBe(2);
    expect(requests[0]).toMatchObject({ since: 9 });
    expect(requests[1]).not.toMatchObject({ since: 9 });
  });

  test("瞬态失败（busy/timeout）不叠全量兜底（再 30s 只会放大压力）", async () => {
    const { routes, sent } = await makeRoutes((command) => {
      if (command.type === 'get_entries') return { ok: false, error: 'busy' };
      return { ok: true, data: {} };
    });
    const outcome = (await routes.invoke('session/entries', { threadId: 't1', since: 5 })) as { ok: boolean; error?: { kind: string; message?: string } };
    expect(outcome).toEqual({ ok: false, error: { kind: 'transient', face: 'busy' } });
    expect(sent.filter((command) => command.type === 'get_entries').length).toBe(1);
  });
});

describe('session 命令契约面', () => {
  test('setThinking：词表外档位 invalid_params（四档词表），合法档透传 set_thinking_level', async () => {
    const { routes, sent } = await makeRoutes(() => ({ ok: true, data: {} }));
    const bad = (await routes.invoke('session/setThinking', { threadId: 't1', level: 'ultra' })) as { ok: boolean; error?: { kind: string; message?: string } };
    expect(bad).toEqual({ ok: false, error: { kind: 'invalid_params' } });
    const ok = (await routes.invoke('session/setThinking', { threadId: 't1', level: 'medium' })) as { ok: boolean };
    expect(ok.ok).toBe(true);
    expect(sent.find((command) => command.type === 'set_thinking_level')).toMatchObject({ type: 'set_thinking_level', threadId: 't1', level: 'medium' });
  });

  test('thinkingLevels：get_thinking_level 响应收窄为 {level,source}', async () => {
    const { routes } = await makeRoutes((command) => {
      if (command.type === 'get_thinking_level') return { ok: true, data: { level: 'low', source: 'session' } };
      return { ok: true, data: {} };
    });
    const outcome = (await routes.invoke('session/thinkingLevels', { threadId: 't1' })) as { ok: boolean; data: { level: string; source: string } };
    expect(outcome).toEqual({ ok: true, data: { level: 'low', source: 'session' } });
  });

  test('subagent/steer：agentId 字段寻址（非 agentName）', async () => {
    const { routes, sent } = await makeRoutes(() => ({ ok: true, data: {} }));
    const outcome = (await routes.invoke('subagent/steer', { threadId: 't1', agentId: 'sa-1', message: '快一点' })) as { ok: boolean };
    expect(outcome.ok).toBe(true);
    expect(sent.find((command) => command.type === 'subagent/steer')).toMatchObject({ type: 'subagent/steer', threadId: 't1', agentId: 'sa-1', message: '快一点' });
  });

  test('session/bash：结果对象收窄 {output,exitCode,cancelled,truncated,fullOutputPath}（垃圾字段降级）', async () => {
    const { routes } = await makeRoutes((command) => {
      if (command.type === 'bash') {
        return { ok: true, data: { output: 'ok', exitCode: 0, cancelled: false, truncated: true, fullOutputPath: '/tmp/full.txt', junk: 'ignored' } };
      }
      return { ok: true, data: {} };
    });
    const outcome = (await routes.invoke('session/bash', { threadId: 't1', command: 'echo ok' })) as {
      ok: boolean;
      data: { output: string; exitCode: number; cancelled: boolean; truncated: boolean; fullOutputPath: string | null };
    };
    expect(outcome).toEqual({
      ok: true,
      data: { output: 'ok', exitCode: 0, cancelled: false, truncated: true, fullOutputPath: '/tmp/full.txt' },
    });
    // 垃圾形状：字段缺省降级（不崩溃）
    const degraded = await makeRoutes((command) => {
      if (command.type === 'bash') return { ok: true, data: {} };
      return { ok: true, data: {} };
    });
    const bare = (await degraded.routes.invoke('session/bash', { threadId: 't1', command: 'x' })) as {
      ok: boolean;
      data: { output: string; exitCode: number; cancelled: boolean; truncated: boolean; fullOutputPath: string | null };
    };
    expect(bare.data).toEqual({ output: '', exitCode: 0, cancelled: false, truncated: false, fullOutputPath: null });
  });

  test('session/abort：clear_queue + abort 两连发（Esc/停止语义）', async () => {
    const { routes, sent } = await makeRoutes(() => ({ ok: true, data: {} }));
    const outcome = (await routes.invoke('session/abort', { threadId: 't1' })) as { ok: boolean };
    expect(outcome.ok).toBe(true);
    const sequence = sent.map((command) => command.type).filter((type) => type === 'clear_queue' || type === 'abort');
    expect(sequence).toEqual(['clear_queue', 'abort']);
  });
});

afterAll(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('session/delete 级联收敛（removed 集驱动注册表行移除）', () => {
  test('主行 + 级联子行按 removed 集收敛；幂等空集无操作', async () => {
    let deleteCount = 0;
    const { routes, runtime, agentDir } = await makeRoutes((command) => {
      if (command.type === 'thread/delete') {
        deleteCount += 1;
        return { ok: true, data: { removed: deleteCount === 1 ? ['main-thread', 'child-thread'] : [] } };
      }
      return { ok: true, data: {} };
    });
    const dir = join(agentDir, 'sessions');
    mkdirSync(join(dir, 'main-thread'), { recursive: true });
    const sessionPath = join(dir, 'main-thread', 'events.jsonl');
    writeFileSync(sessionPath, '{}');
    // seed：模拟已恢复的注册表行（removeSession/registry 依赖 runtime 真表）
    runtime.applyStartOutcome('main-thread', '/w', sessionPath, null, 1, false);
    runtime.applyStartOutcome('child-thread', '/w', join(dir, 'child-thread', 'events.jsonl'), null, 1, false);
    const deleted = (await routes.invoke('session/delete', { sessionPath })) as { ok: boolean; data: { removed: string[] } };
    expect(deleted.ok).toBe(true);
    expect(deleted.data.removed).toEqual(['main-thread', 'child-thread']);
    expect(runtime.registry.get('main-thread')).toBeNull();
    expect(runtime.registry.get('child-thread')).toBeNull();
    // 幂等：hub 回 removed:[]（目录已不在）——无行可动
    const again = (await routes.invoke('session/delete', { sessionPath })) as { ok: boolean; data: { removed: string[] } };
    expect(again.data.removed).toEqual([]);
  });
});

describe('/compact 直发成功三元组（D7：词形命中→compact 命令→data 透传）', () => {
  test('compact 响应三元组解析透传；携图本地硬拒（hub 同文案）', async () => {
    const trio = { summary: 'SUM', replacedCount: 3, summaryTokens: 120 };
    const { routes, runtime, agentDir, sent } = await makeRoutes((command) => (command.type === 'compact' ? { ok: true, data: trio } : { ok: true, data: {} }));
    seedLiveSession(runtime, 't1', agentDir);
    const compacted = (await routes.invoke('session/prompt', { threadId: 't1', message: '/compact keep goals' })) as {
      ok: boolean;
      data: { summary: string; replacedCount: number; summaryTokens: number } | null;
    };
    expect(compacted.ok).toBe(true);
    expect(compacted.data).toEqual(trio);
    const cmd = sent.find((command) => command.type === 'compact');
    expect(cmd).toMatchObject({ type: 'compact', threadId: 't1', customInstructions: 'keep goals' });
    // 携图命中命令：本地硬拒（附件不静默丢弃），不发命令
    const withImage = (await routes.invoke('session/prompt', {
      threadId: 't1',
      message: '/compact',
      images: [{ type: 'image', data: 'aGk=', mediaType: 'image/png' }],
    })) as { ok: boolean; error?: { kind: string; message?: string } };
    expect(withImage).toEqual({ ok: false, error: { kind: 'compact_images_rejected' } });
    expect(sent.filter((command) => command.type === 'compact').length).toBe(1);
  });
});

describe('session/register 主进程处理器（白名单/trusted 审计/删行正则/id 分歧拒）', () => {
  test('白名单外拒绝；合法路径 trusted 补全 + thread_id_mismatch 拒', async () => {
    const { routes, runtime, agentDir, sent } = await makeRoutes((command) =>
      command.type === 'thread/register' ? { ok: true, data: { threadId: command.threadId === 'mismatch-thread' ? 'other-id' : 'main-thread' } } : { ok: true, data: {} },
    );
    const outside = (await routes.invoke('session/register', { sessionPath: '/etc/passwd' })) as { ok: boolean; error?: { kind: string; message?: string } };
    expect(outside.error).toEqual({ kind: 'session_path_forbidden' });
    const dir = join(agentDir, 'sessions', 'main-thread');
    mkdirSync(dir, { recursive: true });
    const sessionPath = join(dir, 'events.jsonl');
    writeFileSync(sessionPath, '{}');
    // 注册表无行 → unknown_session（纳管前须先有行——对账/水化链先行）
    const noRow = (await routes.invoke('session/register', { sessionPath })) as { ok: boolean; error?: { kind: string; message?: string } };
    expect(noRow.error).toEqual({ kind: 'unknown_session' });
    runtime.applyStartOutcome('main-thread', '/w', sessionPath, null, 1, true);
    const ok = (await routes.invoke('session/register', { sessionPath })) as { ok: boolean };
    expect(ok.ok).toBe(true);
    expect(sent.find((command) => command.type === 'thread/register')).toMatchObject({ type: 'thread/register', trusted: true });
    // id 分歧（外部改写怪态）：不落表不换行，显式拒
    const dir2 = join(agentDir, 'sessions', 'mismatch-thread');
    mkdirSync(dir2, { recursive: true });
    const mismatchPath = join(dir2, 'events.jsonl');
    writeFileSync(mismatchPath, '{}');
    runtime.applyStartOutcome('mismatch-thread', '/w', mismatchPath, null, 1, false);
    const mismatch = (await routes.invoke('session/register', { sessionPath: mismatchPath })) as { ok: boolean; error?: { kind: string; message?: string } };
    expect(mismatch.error).toEqual({ kind: 'thread_id_mismatch' });
  });
});


describe('session/prompt 发送管线主进程化（T41 R1：`! ` 路由/空舞台守卫/懒唤醒/自愈）', () => {
  test("症状回归「`! ` 直执行检测在 composer 层」：行首 `! ` 复用 session/bash 命令链（audit/同一收窄实现），不发 prompt、autoTitle 抑制", async () => {
    const audits: string[] = [];
    const { routes, runtime, agentDir, sent } = await makeRoutes(() => ({ ok: true, data: {} }), undefined, audits);
    seedLiveSession(runtime, 't1', agentDir);
    const outcome = (await routes.invoke('session/prompt', { threadId: 't1', message: '  ! git status  ' })) as { ok: boolean; data: unknown };
    expect(outcome).toEqual({ ok: true, data: null });
    expect(sent.find((command) => command.type === 'bash')).toMatchObject({ type: 'bash', threadId: 't1', command: 'git status' });
    expect(sent.some((command) => command.type === 'prompt')).toBe(false);
    expect(audits).toContain('bash_run:t1');
    // 直执行不进模型轮次：命令文本不作标题候选（与原渲染层链同语义）
    expect(sent.some((command) => command.type === 'set_session_name')).toBe(false);
  });

  test('`! ` 携图互斥：bash_images_rejected 本地先拒（compact_images_rejected 同型），附件不静默丢弃', async () => {
    const { routes, runtime, agentDir, sent } = await makeRoutes(() => ({ ok: true, data: {} }));
    seedLiveSession(runtime, 't1', agentDir);
    const outcome = (await routes.invoke('session/prompt', {
      threadId: 't1',
      message: '! echo hi',
      images: [{ type: 'image', data: 'aGk=', mediaType: 'image/png' }],
    })) as { ok: boolean; error?: { kind: string } };
    expect(outcome).toEqual({ ok: false, error: { kind: 'bash_images_rejected' } });
    expect(sent.filter((command) => command.type === 'bash' || command.type === 'prompt')).toEqual([]);
  });

  test('空舞台守卫：注册表外 id（含换轨残留）→ no_active_session 零命令；空串 id 同型（live 会话原样投递对照）', async () => {
    const { routes, runtime, agentDir, sent } = await makeRoutes(() => ({ ok: true, data: {} }));
    seedLiveSession(runtime, 't1', agentDir);
    const unknown = (await routes.invoke('session/prompt', { threadId: 'ghost', message: '你好' })) as { ok: boolean; error?: { kind: string } };
    expect(unknown).toEqual({ ok: false, error: { kind: 'no_active_session' } });
    const bash = (await routes.invoke('session/prompt', { threadId: 'ghost', message: '! ls' })) as { ok: boolean; error?: { kind: string } };
    expect(bash).toEqual({ ok: false, error: { kind: 'no_active_session' } });
    expect(sent).toEqual([]);
    // live 会话原样投递（dead 由 hub 下条命令自动恢复，不本地拦截）
    const ok = (await routes.invoke('session/prompt', { threadId: 't1', message: '你好' })) as { ok: boolean };
    expect(ok.ok).toBe(true);
    expect(sent.find((command) => command.type === 'prompt')).toMatchObject({ threadId: 't1', message: '你好' });
  });

  test('懒唤醒：parked 占位先 thread/resume（收养/换轨链），以恢复后 id 投递；换 id 整行替换', async () => {
    const { routes, runtime, agentDir, sent } = await makeRoutes((command) => {
      if (command.type === 'thread/resume') return { ok: true, data: { threadId: 't9', cwd: '/w', sessionPath: null } };
      return { ok: true, data: {} };
    });
    const sessionPath = join(agentDir, 'sessions', 't1', 'events.jsonl');
    seedLiveSession(runtime, 't1', agentDir, sessionPath);
    runtime.parkSession('t1');
    const outcome = (await routes.invoke('session/prompt', { threadId: 't1', message: '唤醒后发送' })) as { ok: boolean };
    expect(outcome.ok).toBe(true);
    const order = sent.map((command) => command.type).filter((type) => type === 'thread/resume' || type === 'prompt');
    expect(order).toEqual(['thread/resume', 'prompt']);
    expect(sent.find((command) => command.type === 'prompt')).toMatchObject({ threadId: 't9', message: '唤醒后发送' });
    // 换 id 整行替换：旧行移除、新行 live（resume 路由 finishResume 链）
    expect(runtime.registry.get('t1')).toBeNull();
    expect(runtime.sessions().find((row) => row.threadId === 't9')?.state).toBe('live');
  });

  test('懒唤醒失败 → resume_failed 且零 prompt；无会话文件的空占位不可恢复（同型拒绝）', async () => {
    const failed = await makeRoutes((command) => {
      if (command.type === 'thread/resume') return { ok: false, error: { code: 'io_failed', message: 'read error' } };
      return { ok: true, data: {} };
    });
    const sessionPath = join(failed.agentDir, 'sessions', 't1', 'events.jsonl');
    seedLiveSession(failed.runtime, 't1', failed.agentDir, sessionPath);
    failed.runtime.parkSession('t1');
    const outcome = (await failed.routes.invoke('session/prompt', { threadId: 't1', message: '你好' })) as { ok: boolean; error?: { kind: string } };
    expect(outcome).toEqual({ ok: false, error: { kind: 'resume_failed' } });
    expect(failed.sent.some((command) => command.type === 'prompt')).toBe(false);

    const empty = await makeRoutes(() => ({ ok: true, data: {} }));
    seedLiveSession(empty.runtime, 't2', empty.agentDir, null);
    empty.runtime.parkSession('t2');
    const noFile = (await empty.routes.invoke('session/prompt', { threadId: 't2', message: '你好' })) as { ok: boolean; error?: { kind: string } };
    expect(noFile).toEqual({ ok: false, error: { kind: 'resume_failed' } });
    expect(empty.sent).toEqual([]);
  });

  test('症状回归「消息未发送（unknown_thread）」：僵尸视图自愈——按注册表 sessionPath 强制重锚恰一次，以新 id 重投成功', async () => {
    let promptIndex = 0;
    const { routes, runtime, agentDir, sent } = await makeRoutes((command) => {
      if (command.type === 'prompt') {
        promptIndex += 1;
        // 首答打旧 id（hub 线程表已忘）：unknown_thread；重投打新 id 放行
        return promptIndex === 1 ? { ok: false, error: { code: 'unknown_thread', message: 'Unknown threadId' } } : { ok: true, data: null };
      }
      if (command.type === 'thread/resume') return { ok: true, data: { threadId: 't2', cwd: '/w', sessionPath: null } };
      return { ok: true, data: {} };
    });
    seedLiveSession(runtime, 't1', agentDir);
    const outcome = (await routes.invoke('session/prompt', { threadId: 't1', message: '你好' })) as { ok: boolean };
    expect(outcome.ok).toBe(true);
    expect(sent.filter((command) => command.type === 'thread/resume')).toHaveLength(1);
    expect(sent.filter((command) => command.type === 'prompt').map((command) => command.threadId)).toEqual(['t1', 't2']);
  });

  test('自愈重锚失败/无会话文件：按原 kind 上抛（不无限重试、不发无用 resume）', async () => {
    const failed = await makeRoutes((command) => {
      if (command.type === 'prompt') return { ok: false, error: { code: 'unknown_thread', message: 'Unknown threadId' } };
      if (command.type === 'thread/resume') return { ok: false, error: { code: 'io_failed', message: 'read error' } };
      return { ok: true, data: {} };
    });
    seedLiveSession(failed.runtime, 't1', failed.agentDir);
    const outcome = (await failed.routes.invoke('session/prompt', { threadId: 't1', message: '你好' })) as { ok: boolean; error?: { kind: string; message?: string } };
    expect(outcome).toEqual({ ok: false, error: { kind: 'unknown_thread', message: 'Unknown threadId' } });
    expect(failed.sent.filter((command) => command.type === 'prompt')).toHaveLength(1);

    const noPath = await makeRoutes((command) => {
      if (command.type === 'prompt') return { ok: false, error: { code: 'unknown_thread', message: 'Unknown threadId' } };
      return { ok: true, data: {} };
    });
    seedLiveSession(noPath.runtime, 't1', noPath.agentDir, null);
    const noPathOutcome = (await noPath.routes.invoke('session/prompt', { threadId: 't1', message: '你好' })) as { ok: boolean; error?: { kind: string } };
    expect(noPathOutcome.error).toEqual({ kind: 'unknown_thread', message: 'Unknown threadId' });
    expect(noPath.sent.some((command) => command.type === 'thread/resume')).toBe(false);
  });

  test('thread_superseded（fork 换轨）不触发自愈——防复活 fork 前状态：单次 prompt 原样上抛', async () => {
    const { routes, runtime, agentDir, sent } = await makeRoutes((command) => {
      if (command.type === 'prompt') return { ok: false, error: { code: 'thread_superseded', message: 'thread superseded by fork' } };
      return { ok: true, data: {} };
    });
    seedLiveSession(runtime, 't1', agentDir);
    const outcome = (await routes.invoke('session/prompt', { threadId: 't1', message: '你好' })) as { ok: boolean; error?: { kind: string } };
    expect(outcome).toEqual({ ok: false, error: { kind: 'thread_superseded', message: 'thread superseded by fork' } });
    expect(sent.filter((command) => command.type === 'prompt')).toHaveLength(1);
    expect(sent.some((command) => command.type === 'thread/resume')).toBe(false);
  });

  test('`! ` 于 parked 占位同样先唤活（发送管线统一前置）：resume 后以新 id 执行 bash', async () => {
    const { routes, runtime, agentDir, sent } = await makeRoutes((command) => {
      if (command.type === 'thread/resume') return { ok: true, data: { threadId: 't9', cwd: '/w', sessionPath: null } };
      return { ok: true, data: {} };
    });
    const sessionPath = join(agentDir, 'sessions', 't1', 'events.jsonl');
    seedLiveSession(runtime, 't1', agentDir, sessionPath);
    runtime.parkSession('t1');
    const outcome = (await routes.invoke('session/prompt', { threadId: 't1', message: '! pwd' })) as { ok: boolean };
    expect(outcome.ok).toBe(true);
    expect(sent.find((command) => command.type === 'bash')).toMatchObject({ type: 'bash', threadId: 't9', command: 'pwd' });
    expect(sent.some((command) => command.type === 'prompt')).toBe(false);
  });
});
