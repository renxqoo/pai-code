import { afterAll, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { HUB_ERROR_CODES } from '@paiapp/contracts';
import { createApiRoutes } from '../api-routes';
import { createAgentDefinitionsStore } from '../agent-definitions-store';
import { createFileSettings, type ProviderKeyStore } from '../file-settings';
import { createPaiRuntime, type PaiRuntime } from '../pai-runtime';
import { createRuntimeMonitor } from '@paiapp/infra';

/**
 * 真 x-harness host-hub 集成（默认门）：script provider（HUB_WORKER_PROVIDER=script +
 * HUB_WORKER_SCRIPT 剧本——env 值是裸 JSON 数组，判别键 reply/toolCalls/error/delayMs），
 * 驱动全部 hub 触达的 app API 面并断言落存储——会话 WAL（<agentDir>/sessions/<id>/
 * events.jsonl + header.json）、注册表、providers.json、hub-settings.json、agent 定义
 * 文件（HOME 隔离，.x-harness 域）。GLM 真凭证旅程保留 opt-in（PAI_E2E=1 + GLM_*）。
 */

const hubEntry = process.env['PAI_HUB_ENTRY'] ?? '/Users/wrr/work/x-harness/apps/host-hub/src/host/cli.ts';
const bunPath = process.env['PAI_BUN_PATH'] ?? '/Users/wrr/work/agent-app/resources/bun/bun';
const hubAvailable = existsSync(hubEntry);

/** script 剧本：多次文本回复（prompt/fork 重试等多轮消费——worker 单例共享游标）。 */
const REPLY_SCRIPT = JSON.stringify([{ reply: '收到' }, { reply: '第二条' }, { reply: '第三条' }, { reply: '第四条' }]);
/** script 剧本：先长延迟（可中止面）后回复。 */
const DELAY_SCRIPT = JSON.stringify([{ delayMs: 30_000 }]);
/** script 剧本：agent_spawn 工具调用（子代理旅程——主/子共享游标，子消费 reply）。 */
const SPAWN_SCRIPT = JSON.stringify([
  { toolCalls: [{ name: 'agent_spawn', input: '{"description":"research the parser","prompt":"do work"}' }] },
  { reply: 'parent continues' },
  { reply: 'child works' },
]);

interface Harness {
  runtime: PaiRuntime;
  monitor: ReturnType<typeof createRuntimeMonitor>;
  invoke: (method: string, params: unknown) => Promise<{ ok: boolean }>;
  events: string[];
  eventNames: string[];
  /** 最近一次 confirm 弹窗的 requestId（bash 应答面）。 */
  lastDialogRequestId: () => string | null;
  work: string;
  agentDir: string;
  home: string;
}

const harnesses: Harness[] = [];

/** 装配真实主进程链路（runtime + routes + monitor）；script provider 经 extraSpawnEnv 注入缝。 */
function makeHarness(script: string): Harness {
  const work = mkdtempSync(join(tmpdir(), 't39-e2e-'));
  const agentDir = join(work, 'agent');
  const home = join(work, 'home');
  mkdirSync(home, { recursive: true });
  // agent 定义/技能目录 ~/.x-harness 走 HOME：bun 的 os.homedir() 启动即缓存，
  // 进程内 HOME 重定向对 store 无效——store 经 homeDir 注入缝隔离；
  // hub 侧 agents/skills 的 user 目录解析用进程 HOME（对 host 子进程生效）
  process.env['HOME'] = home;
  // 种一个用户级技能（x-harness skills 域 = 平铺 .md + frontmatter）
  mkdirSync(join(home, '.x-harness', 'skills', 'demo-skill'), { recursive: true });
  writeFileSync(join(home, '.x-harness', 'skills', 'demo-skill', 'SKILL.md'), '---\nname: demo-skill\ndescription: Demo skill for the integration journey\n---\nDemo body.\n');
  const keyStore: ProviderKeyStore = {
    encryptionAvailable: false,
    getKey: () => null,
    setKey: () => undefined,
    keyNames: [],
  };
  const events: string[] = [];
  const eventNames: string[] = [];
  let lastDialog: string | null = null;
  const runtime = createPaiRuntime({
    paths: {
      userDataDir: work,
      agentDir,
      registryDb: join(work, 'registry.sqlite'),
      settingsFile: join(work, 'settings.json'),
      providerKeysFile: join(work, 'keys.json'),
      logFile: join(work, 'main.log'),
    },
    keyStore,
    providers: () => [],
    idleRecycleMinutes: () => 5,
    hubPaths: () => ({ bunPath, hubEntry }),
    logger: { log: () => undefined },
    emit: (event) => {
      events.push(event.type);
      if (event.type === 'dialogRequest') lastDialog = event.requestId;
    },
    extraSpawnEnv: () => ({ HUB_WORKER_PROVIDER: 'script', HUB_WORKER_SCRIPT: script }),
  });
  const settings = createFileSettings(join(work, 'settings.json'), keyStore);
  const monitor = createRuntimeMonitor({
    host: () => {
      try {
        return runtime.host;
      } catch {
        return null;
      }
    },
    hub: () => {
      try {
        return runtime.hub;
      } catch {
        return null;
      }
    },
    appMetrics: () => ({ rssBytes: null, cpuPercent: null }),
    systemMemory: () => ({ totalBytes: null, availableBytes: null }),
    idleRecycleMinutes: () => 5,
    appVersion: () => 'test',
  });
  const routes = createApiRoutes({
    runtime,
    settings,
    keyStore,
    audit: () => undefined,
    agentDefinitions: createAgentDefinitionsStore(home),
    agentDir,
    revealPath: () => undefined,
    pickDirectory: () => Promise.resolve(null),
    monitor,
    exportDiagnosticsBundle: () => join(work, 'diagnostics'),
  });
  const harness: Harness = { runtime, monitor, invoke: (m, p) => routes.invoke(m, p) as Promise<{ ok: boolean }>, events, eventNames, lastDialogRequestId: () => lastDialog, work, agentDir, home };
  harnesses.push(harness);
  return harness;
}

/** 订阅 hub 原始事件帧（host.onFrame 观察缝——词表实证与 UiEvent 映射解耦）。 */
function tapEventNames(runtime: PaiRuntime, names: string[]): void {
  runtime.host.onFrame((frame) => {
    if (frame.type === 'event') names.push(frame.name);
  });
}

afterAll(async () => {
  for (const harness of harnesses) {
    try {
      await harness.runtime.stop();
    } catch {
      // 已停实例的二次 stop
    }
  }
});

function waitFor(predicate: () => boolean, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const timer = setInterval(() => {
      if (predicate()) {
        clearInterval(timer);
        resolve(true);
        return;
      }
      if (Date.now() - startedAt > timeoutMs) {
        clearInterval(timer);
        resolve(false);
      }
    }, 50);
  });
}

/** 读会话 WAL（events.jsonl）行并解析（行形状 = {type, seq, time, data}）。 */
function walEvents(eventsPath: string): Array<Record<string, unknown>> {
  const text = readFileSync(eventsPath, 'utf8');
  const out: Array<Record<string, unknown>> = [];
  for (const line of text.split('\n')) {
    if (line.trim() === '') continue;
    try {
      out.push(JSON.parse(line) as Record<string, unknown>);
    } catch {
      // 撕裂尾行容忍
    }
  }
  return out;
}

describe('app API 全接口 × 真 x-harness host-hub（script 默认门）', () => {
  // 环境前提：本门需要旁级 x-harness 检出（hub 源码入口）。入口缺失时显式 skip
  //（bun test 记 skip 不记 pass——不产生「绿但什么都没测」的假门）
  test.if(hubAvailable)('全接口旅程 + 落存储断言', async () => {
    const h = makeHarness(REPLY_SCRIPT);
    await h.runtime.start();
    expect(h.runtime.host.phase).toBe('ready');
    tapEventNames(h.runtime, h.eventNames);

    // --- bootstrap：get_models + list_saved 聚合（无渠道 → 空模型面合法） ---
    const bootstrap = (await h.invoke('app/bootstrap', {})) as { ok: boolean; data: { models: unknown[]; saved: unknown[]; hostPhase: string } };
    expect(bootstrap.ok).toBe(true);
    expect(bootstrap.data.hostPhase).toBe('ready');

    // --- 码表对拍（T40 §2.6 真·双侧封闭）：真 hub 握手暴露的 errorCodes 与
    //     contracts 镜像集合相等——x-harness 新增码未镜像即此断言红 ---
    const info = await h.runtime.hub.host.info();
    expect(info.ok).toBe(true);
    expect([...((info.data as { errorCodes: string[] }).errorCodes ?? [])].sort()).toEqual([...HUB_ERROR_CODES].sort());

    // --- 会话生命周期：start → events.jsonl + header.json 落盘 ---
    const started = (await h.invoke('session/start', { cwd: h.work, trusted: true })) as { ok: boolean; data: { threadId: string; sessionPath: string } };
    expect(started.ok).toBe(true);
    const threadId = started.data.threadId;
    const sessionPath = started.data.sessionPath;
    expect(sessionPath.endsWith('events.jsonl')).toBe(true);
    expect(existsSync(sessionPath)).toBe(true);
    expect(existsSync(join(sessionPath, '..', 'header.json'))).toBe(true);
    // hub 对 cwd 做 realpath 归一（normalizeCwd）——macOS /var → /private/var 符号链接展开
    expect(h.runtime.registry.get(threadId)?.cwd).toBe(realpathSync(h.work));

    // --- prompt：受理即答 + settled 终态 + 流式词表事件 ---
    const prompted = await h.invoke('session/prompt', { threadId, message: '只回复两个字：收到' });
    expect(prompted.ok).toBe(true);
    expect(await waitFor(() => h.events.includes('turnSettled'), 60_000)).toBe(true);
    expect(h.events).toContain('turnStarted');
    expect(h.events).toContain('messageFinal');
    // x-harness 事件面：主会话 session 域帧 + 合成域帧经桥外发（词表实证）
    expect(h.eventNames).toContain('agent/inbox/spliced');
    expect(h.eventNames).toContain('user/message');
    expect(h.eventNames).toContain('assistant/message');
    expect(h.eventNames).toContain('llm/chunk');

    // --- WAL 落存储：内核事件（user/message + assistant/message） ---
    const rows = walEvents(sessionPath);
    const types = rows.map((row) => row['type']);
    expect(types).toContain('user/message');
    expect(types).toContain('assistant/message');

    // --- entries：seq 游标域（0 基 WAL 行号）+ 增量窗口 ---
    const entries = (await h.invoke('session/entries', { threadId })) as { ok: boolean; data: { items: Array<{ kind: string }>; cursor: number | null } };
    expect(entries.ok).toBe(true);
    const kinds = entries.data.items.map((item) => item.kind);
    expect(kinds).toContain('user');
    expect(kinds).toContain('assistant');
    const cursor = entries.data.cursor;
    expect(typeof cursor).toBe('number');
    const delta = (await h.invoke('session/entries', { threadId, since: cursor })) as { ok: boolean; data: { items: unknown[] } };
    expect(delta.ok).toBe(true);

    // --- state（model 复合形）/ inflight / stats（cost 入 tokens） ---
    const state = (await h.invoke('session/state', { threadId })) as { ok: boolean; data: { isStreaming: boolean; queue: { steering: string[] } } };
    expect(state.ok).toBe(true);
    expect(state.data.isStreaming).toBe(false);
    const inflight = (await h.invoke('session/inflight', { threadId })) as { ok: boolean; data: { turnStartSeq: number | null } };
    expect(inflight.ok).toBe(true);
    const stats = (await h.invoke('session/stats', { threadId })) as { ok: boolean; data: { tokens: { total: number }; toolResults: number } };
    expect(stats.ok).toBe(true);
    expect(stats.data.tokens.total).toBeGreaterThan(0);

    // --- 子代理读口（无子代理 → 空形态）与 steer 错误路径（驻留外文案） ---
    const subagents = (await h.invoke('session/subagents', { threadId })) as { ok: boolean; data: { subagents: unknown[] } };
    expect(subagents.ok).toBe(true);
    expect(subagents.data.subagents).toEqual([]);
    const steer = (await h.invoke('subagent/steer', { threadId, agentId: 'agent-00000000', message: 'hi' })) as { ok: boolean; error?: { kind: string; message?: string } };
    expect(steer.ok).toBe(false);
    expect(steer.error?.kind).toBe('invalid_input');
    expect(steer.error?.message).toContain('not available');

    // --- setName → WAL session/meta ---
    const renamed = await h.invoke('session/setName', { threadId, name: '集成旅程' });
    expect(renamed.ok).toBe(true);
    expect(await waitFor(() => walEvents(sessionPath).some((row) => row['type'] === 'session/meta'), 15_000)).toBe(true);

    // --- setModel（下一轮生效；script 目录快照 = provider script / 模型 script-1） ---
    const setModel = await h.invoke('session/setModel', { threadId, provider: 'script', modelId: 'script-1' });
    expect(setModel.ok).toBe(true);
    // --- setThinking：5 档词表（script-1 reasoning 声明 → max 过） ---
    const setThinking = await h.invoke('session/setThinking', { threadId, level: 'max' });
    expect(setThinking.ok).toBe(true);
    const thinking = (await h.invoke('session/thinkingLevels', { threadId })) as { ok: boolean; data: { level: string; source: string } };
    expect(thinking.ok).toBe(true);
    expect(thinking.data.level).toBe('max');
    expect(thinking.data.source).toBe('session');

    // --- 权限模式：3 档词表 setMode → mode 读回 ---
    const setMode = await h.invoke('permission/setMode', { threadId, mode: 'auto' });
    expect(setMode.ok).toBe(true);
    const mode = (await h.invoke('permission/mode', { threadId })) as { ok: boolean; data: { mode: string } };
    expect(mode.ok).toBe(true);
    expect(mode.data.mode).toBe('auto');

    // --- hub 用户级设置：写 → hub-settings.json 落盘 ---
    const setHub = await h.invoke('app/setHubSettings', { permissionDefaultMode: 'auto', thinkingDefault: 'low' });
    expect(setHub.ok).toBe(true);
    expect(await waitFor(() => existsSync(join(h.agentDir, 'hub-settings.json')), 10_000)).toBe(true);
    const hubSettings = JSON.parse(readFileSync(join(h.agentDir, 'hub-settings.json'), 'utf8')) as Record<string, unknown>;
    expect(hubSettings['permission.defaultMode']).toBe('auto');
    const hubRead = (await h.invoke('app/hubSettings', {})) as { ok: boolean; data: { permissionDefaultMode: string | null; thinkingDefault: string | null } };
    expect(hubRead.ok).toBe(true);
    expect(hubRead.data.thinkingDefault).toBe('low');

    // --- 技能面：hub skills/list（种子可见，source user）+ preview 目录 + 禁用 ---
    const skills = (await h.invoke('skills/list', {})) as { ok: boolean; data: Array<{ name: string; enabled: boolean }> };
    expect(skills.ok).toBe(true);
    expect(skills.data.some((item) => item.name === 'demo-skill' && item.enabled)).toBe(true);
    const preview = (await h.invoke('command/preview', {})) as { ok: boolean; data: Array<{ name: string; source: string }> };
    expect(preview.ok).toBe(true);
    expect(preview.data.some((item) => item.name === 'skill:demo-skill')).toBe(true);
    const disabled = (await h.invoke('skills/setEnabled', { name: 'demo-skill', enabled: false })) as { ok: boolean; data: Array<{ name: string; enabled: boolean }> };
    expect(disabled.ok).toBe(true);
    expect(disabled.data.some((item) => item.name === 'demo-skill' && !item.enabled)).toBe(true);

    // --- 命令目录（内核命令注册面：compact source command） ---
    const commands = (await h.invoke('command/list', { threadId })) as { ok: boolean; data: Array<{ name: string; source: string }> };
    expect(commands.ok).toBe(true);
    expect(commands.data.some((item) => item.name === 'compact' && item.source === 'command')).toBe(true);

    // --- agent 定义：user 级走 hub 命令 → ~/.x-harness/agents/<name>.md（HOME 隔离）→ remove ---
    const definition = { name: 'code-reviewer', description: 'Review code for defects', systemPrompt: 'You review code.', tools: ['read', 'grep'] as string[] | null, model: null as string | null, scope: 'user' as const, project: null };
    const upserted = await h.invoke('agent/upsert', { definition, previous: null });
    expect(upserted.ok).toBe(true);
    const agentFile = join(h.home, '.x-harness', 'agents', 'code-reviewer.md');
    expect(existsSync(agentFile)).toBe(true);
    // round-trip 保证由 hub 命令面承担（写删即生效且格式永不漂移——agents/list 真命令可见）
    const hubListed = await h.runtime.host.request({ type: 'agents/list' } as never);
    expect(hubListed.ok).toBe(true);
    const hubAgents = ((hubListed as { ok: true; data: { agents?: unknown } }).data.agents ?? []) as Array<{ name: string; source: string }>;
    expect(hubAgents.some((item) => item.name === 'code-reviewer' && item.source === 'user')).toBe(true);
    const listed = (await h.invoke('agent/definitions', {})) as { ok: boolean; data: Array<{ name: string }> };
    expect(listed.data.some((item) => item.name === 'code-reviewer')).toBe(true);
    const removed = await h.invoke('agent/remove', { name: 'code-reviewer', scope: 'user', project: null });
    expect(removed.ok).toBe(true);
    expect(existsSync(agentFile)).toBe(false);

    // --- /compact 直发（D7）：词形命中 → compact 命令 → 新会话上下文太小错误面透传 ---
    const compacted = (await h.invoke('session/prompt', { threadId, message: '/compact keep the goals' })) as { ok: boolean; error?: { kind: string; message?: string } };
    expect(compacted.ok).toBe(false);
    // compaction 词表内层穿透：compact_rejected + 原文 message
    expect(compacted.error?.kind).toBe('compact_rejected');
    expect(compacted.error?.message).toBe('context too small to compact');

    // --- fork：seq 域（0 基）→ 新会话 + fork 落存储 ---
    const fork = (await h.invoke('session/fork', { threadId, seq: cursor, position: 'at' })) as { ok: boolean; data: { threadId: string; sessionPath: string } };
    expect(fork.ok).toBe(true);
    expect(fork.data.threadId).not.toBe(threadId);
    expect(existsSync(fork.data.sessionPath)).toBe(true);

    // --- 直执行 bash：confirm 弹窗 → 应答 → 结果对象 + WAL 信封 ---
    const bashDone = h.invoke('session/bash', { threadId: fork.data.threadId, command: 'echo hub-e2e' });
    expect(await waitFor(() => h.lastDialogRequestId() !== null, 30_000)).toBe(true);
    const respond = await h.invoke('dialog/respond', { requestId: h.lastDialogRequestId(), payload: { confirmed: true } });
    expect(respond.ok).toBe(true);
    const bash = (await bashDone) as { ok: boolean; data: { output: string; exitCode: number; cancelled: boolean } };
    expect(bash.ok).toBe(true);
    expect(bash.data.output).toContain('hub-e2e');
    expect(bash.data.exitCode).toBe(0);
    expect(await waitFor(() => walEvents(fork.data.sessionPath).some((row) => JSON.stringify(row).includes('[bash] $ echo hub-e2e')), 15_000)).toBe(true);

    // --- 受理窗口重试：streaming 中无 streamingBehavior 的 prompt 自动降级 ---
    const queued = await h.invoke('session/prompt', { threadId: fork.data.threadId, message: 'echo one' });
    expect(queued.ok).toBe(true);
    const immediate = await h.invoke('session/prompt', { threadId: fork.data.threadId, message: 'echo two' });
    expect(immediate.ok).toBe(true);
    expect(await waitFor(() => h.events.filter((type) => type === 'turnSettled').length >= 2, 60_000)).toBe(true);

    // --- listSaved：标题可见（events.jsonl 布局重建） ---
    const saved = (await h.invoke('session/listSaved', {})) as { ok: boolean; data: Array<{ sessionPath: string; name: string | null }> };
    expect(saved.ok).toBe(true);
    expect(saved.data.some((item) => item.name === '集成旅程')).toBe(true);

    // --- providers.json 落盘形状（x-harness 档案制） ---
    expect(existsSync(join(h.agentDir, 'providers.json'))).toBe(true);
    const providersFile = JSON.parse(readFileSync(join(h.agentDir, 'providers.json'), 'utf8')) as { providers: unknown[] };
    expect(Array.isArray(providersFile.providers)).toBe(true);
    // 旧目录文件清扫（models.json 孤儿不残留）
    expect(existsSync(join(h.agentDir, 'models.json'))).toBe(false);

    // --- stop：注册表收敛 ---
    const stopped = await h.invoke('session/stop', { threadId: fork.data.threadId, remove: true });
    expect(stopped.ok).toBe(true);
    expect(h.runtime.registry.get(fork.data.threadId)).toBeNull();

    // --- 运行快照与诊断读口（monitor 单次轮询喂 hostInfo——产品装配里是 2s 定时器） ---
    await h.monitor.poll();
    const runtimeView = (await h.invoke('app/runtime', {})) as { ok: boolean; data: { hostInfo: { limits: { maxThreads: number } } | null } };
    expect(runtimeView.ok).toBe(true);
    expect(runtimeView.data.hostInfo?.limits.maxThreads).toBeGreaterThan(0);
    const diagnostics = await h.invoke('app/diagnosticLog', {});
    expect((diagnostics as { ok: boolean }).ok).toBe(true);
  }, 300_000);

  test.if(hubAvailable)('子代理旅程：agent_spawn 工具 → work 链 wire + 面板事件（共享游标编排）', async () => {
    const h = makeHarness(SPAWN_SCRIPT);
    await h.runtime.start();
    expect(h.runtime.host.phase).toBe('ready');
    tapEventNames(h.runtime, h.eventNames);
    await h.invoke('app/bootstrap', {});
    // full 档起线程：agent_spawn 工具不弹窗（journeys 同款旅程锚）
    const started = (await h.invoke('session/start', { cwd: h.work, trusted: true, permissionMode: 'full' })) as { ok: boolean; data: { threadId: string } };
    expect(started.ok).toBe(true);
    const threadId = started.data.threadId;
    const prompted = await h.invoke('session/prompt', { threadId, message: 'spawn one' });
    expect(prompted.ok).toBe(true);
    // spawned 帧（work 随载荷）→ 面板 subagentStarted；finished 帧（每周期恰一次）
    expect(await waitFor(() => h.events.includes('subagentStarted'), 60_000)).toBe(true);
    expect(await waitFor(() => h.events.includes('subagentSettled'), 60_000)).toBe(true);
    expect(h.eventNames).toContain('agent/spawned');
    expect(h.eventNames).toContain('agent/finished');
    // 子代理文本增量经 agent/assistant-stream（agentName 帧归属）
    expect(h.eventNames).toContain('agent/assistant-stream');
    // get_subagents 快照：ChildView work 零降级（T39 D10.2 验收）
    const subagents = (await h.invoke('session/subagents', { threadId })) as { ok: boolean; data: { subagents: Array<{ kind: string; work?: string; status: string }> } };
    expect(subagents.ok).toBe(true);
    const row = subagents.data.subagents[0];
    expect(row?.work).toBe('research the parser');
    expect(await waitFor(() => h.events.includes('turnSettled'), 60_000)).toBe(true);
  }, 180_000);

  test.if(hubAvailable)('生命周期：abort 中止面 + retire→parked→resume 收养 + delete 级联', async () => {
    const d = makeHarness(DELAY_SCRIPT);
    await d.runtime.start();
    expect(d.runtime.host.phase).toBe('ready');
    tapEventNames(d.runtime, d.eventNames);
    // 事件面在 bootstrap 前缓冲（EVENT_BUFFER）——先开门再断言事件流
    await d.invoke('app/bootstrap', {});
    const delaySession = (await d.invoke('session/start', { cwd: d.work })) as { ok: boolean; data: { threadId: string; sessionPath: string } };
    expect(delaySession.ok).toBe(true);
    const delayPrompt = await d.invoke('session/prompt', { threadId: delaySession.data.threadId, message: 'long work' });
    expect(delayPrompt.ok).toBe(true);
    expect(await waitFor(() => d.events.includes('turnStarted'), 30_000)).toBe(true);
    const aborted = await d.invoke('session/abort', { threadId: delaySession.data.threadId });
    expect(aborted.ok).toBe(true);
    const settledBefore = d.events.filter((type) => type === 'turnSettled').length;
    expect(await waitFor(() => d.events.filter((type) => type === 'turnSettled').length > settledBefore, 30_000)).toBe(true);

    // --- retire → parked 帧 → resume 收养（parked 表项在 hub 表内：resume-by-path
    //     撞 already open → thread/list 按 path 回落收养——T38 实施期缺陷的回归锁定） ---
    const retired = await d.invoke('session/retire', { threadId: delaySession.data.threadId });
    expect(retired.ok).toBe(true);
    expect(await waitFor(() => d.events.includes('sessionParked'), 30_000)).toBe(true);
    const resumed = (await d.invoke('session/resume', { sessionPath: delaySession.data.sessionPath })) as { ok: boolean; data: { threadId: string } };
    expect(resumed.ok).toBe(true);
    expect(resumed.data.threadId).toBe(delaySession.data.threadId);

    // --- keepalive：注册表持久真相 ---
    const keepalive = await d.invoke('session/setKeepalive', { threadId: delaySession.data.threadId, keepalive: true });
    expect(keepalive.ok).toBe(true);
    expect(d.runtime.registry.get(delaySession.data.threadId)?.keepalive).toBe(true);

    // --- 闲置档位：set_idle_retire_ms（value 域） ---
    const idle = await d.invoke('app/setIdleRecycle', { minutes: 15 });
    expect(idle.ok).toBe(true);

    // --- forceRetire → parked → thread/delete 级联（removed 透传 + 目录消失 + 幂等） ---
    const forced = await d.invoke('session/forceRetire', { threadId: delaySession.data.threadId });
    expect(forced.ok).toBe(true);
    // forceRetire 的 clear_queue 会唤醒线程（对 parked 表项的驱动命令自动唤醒）——
    // 收编后再停一次幂等收敛（产品流：删除前会话已停），delete 只对非活族放行
    const stopped = await d.invoke('session/stop', { threadId: delaySession.data.threadId, remove: true });
    expect(stopped.ok).toBe(true);
    expect(await waitFor(() => d.runtime.registry.get(delaySession.data.threadId) === null, 15_000)).toBe(true);
    const deleted = (await d.invoke('session/delete', { sessionPath: delaySession.data.sessionPath })) as { ok: boolean; reason?: string; data: { removed: string[] } };
    expect(deleted.ok).toBe(true);
    expect(deleted.data.removed).toContain(delaySession.data.threadId);
    expect(existsSync(delaySession.data.sessionPath)).toBe(false);
    expect(d.runtime.registry.get(delaySession.data.threadId)).toBeNull();
    // 幂等：目录已不在 = success + 空 removed
    const again = (await d.invoke('session/delete', { sessionPath: delaySession.data.sessionPath })) as { ok: boolean; data: { removed: string[] } };
    expect(again.ok).toBe(true);
    expect(again.data.removed).toEqual([]);
  }, 180_000);
});

describe('app API × 真 x-harness host-hub（GLM 真门，opt-in）', () => {
  const e2eEnabled = process.env['PAI_E2E'] === '1';
  const glmKey = process.env['GLM_API_KEY'] ?? '';
  const glmModel = process.env['GLM_MODEL'] ?? '';
  const glmBaseUrl = (process.env['GLM_BASE_URL'] ?? '').replace(/\/chat\/completions$/, '');
  const runnable = e2eEnabled && hubAvailable && glmKey.length > 0 && glmModel.length > 0 && glmBaseUrl.length > 0;

  // 真凭证旅程：GLM 预设裸 id 端点不认（T38 挂账沿袭）——走 app 渠道条目（providers.json custom）
  test.if(runnable)('GLM 全旅程：custom 渠道 → start(modelId) → prompt settled → entries → stop', async () => {
    const work = mkdtempSync(join(tmpdir(), 't39-glm-'));
    const keyStore: ProviderKeyStore = {
      encryptionAvailable: false,
      getKey: (name) => (name === 'glm-e2e' ? glmKey : null),
      setKey: () => undefined,
      keyNames: ['glm-e2e'],
    };
    const events: string[] = [];
    const runtime = createPaiRuntime({
      paths: {
        userDataDir: work,
        agentDir: join(work, 'agent'),
        registryDb: join(work, 'registry.sqlite'),
        settingsFile: join(work, 'settings.json'),
        providerKeysFile: join(work, 'keys.json'),
        logFile: join(work, 'main.log'),
      },
      keyStore,
      providers: () => [{ name: 'glm-e2e', baseUrl: glmBaseUrl, api: 'anthropic', models: [{ id: glmModel, reasoning: true, vision: false }] }],
      idleRecycleMinutes: () => 5,
      hubPaths: () => ({ bunPath, hubEntry }),
      logger: { log: () => undefined },
      emit: (event) => events.push(event.type),
    });
    const monitor = createRuntimeMonitor({
      host: () => {
        try {
          return runtime.host;
        } catch {
          return null;
        }
      },
      hub: () => {
        try {
          return runtime.hub;
        } catch {
          return null;
        }
      },
      appMetrics: () => ({ rssBytes: null, cpuPercent: null }),
      systemMemory: () => ({ totalBytes: null, availableBytes: null }),
      idleRecycleMinutes: () => 5,
      appVersion: () => 'test',
    });
    const settings = createFileSettings(join(work, 'settings.json'), keyStore);
    const routes = createApiRoutes({
      runtime,
      settings,
      keyStore,
      audit: () => undefined,
      agentDefinitions: createAgentDefinitionsStore(work),
      agentDir: join(work, 'agent'),
      revealPath: () => undefined,
      pickDirectory: () => Promise.resolve(null),
      monitor,
      exportDiagnosticsBundle: () => join(work, 'diagnostics'),
    });
    harnesses.push({ runtime, monitor, invoke: (m, p) => routes.invoke(m, p) as Promise<{ ok: boolean }>, events, eventNames: [], lastDialogRequestId: () => null, work, agentDir: join(work, 'agent'), home: work });
    await runtime.start();
    expect(runtime.host.phase).toBe('ready');

    const started = (await routes.invoke('session/start', { cwd: work, modelId: glmModel, trusted: true })) as { ok: boolean; data: { threadId: string } };
    expect(started.ok).toBe(true);
    const threadId = started.data.threadId;
    const prompted = (await routes.invoke('session/prompt', { threadId, message: '只回复两个字：收到' })) as { ok: boolean };
    expect(prompted.ok).toBe(true);
    expect(await waitFor(() => events.includes('turnSettled'), 180_000)).toBe(true);
    const entries = (await routes.invoke('session/entries', { threadId })) as { ok: boolean; data: { items: Array<{ kind: string }> } };
    expect(entries.ok).toBe(true);
    expect(entries.data.items.map((item) => item.kind)).toContain('assistant');
    const stopped = (await routes.invoke('session/stop', { threadId, remove: true })) as { ok: boolean };
    expect(stopped.ok).toBe(true);
  }, 240_000);
});
