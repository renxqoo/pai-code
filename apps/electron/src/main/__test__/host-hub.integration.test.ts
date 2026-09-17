import { afterAll, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createApiRoutes } from '../api-routes';
import { createAgentDefinitionsStore } from '../agent-definitions-store';
import { createFileSettings, type ProviderKeyStore } from '../file-settings';
import { createPaiRuntime, type PaiRuntime } from '../pai-runtime';
import { createRuntimeMonitor } from '../runtime-monitor/create-runtime-monitor';

/**
 * 真 host-hub 集成（默认门）：faux provider 内嵌 worker（HUB_WORKER_PROVIDER=faux +
 * HUB_FAUX_SCRIPT 剧本——env 值是裸数组），驱动全部 hub 触达的 app API 面并断言
 * 落存储——会话 WAL（<agentDir>/sessions/<id>/transcript.jsonl）、注册表、models.json、
 * hub-settings.json、agent 定义文件（HOME 隔离）。
 * GLM 真凭证旅程保留 opt-in（PAI_E2E=1 + GLM_* 环境才跑，花钱不进默认门）。
 */

const hubEntry = process.env['PAI_HUB_ENTRY'] ?? '/Users/wrr/work/my-agent/packages/host-hub/src/host/cli.ts';
const bunPath = process.env['PAI_BUN_PATH'] ?? '/Users/wrr/work/agent-app/resources/bun/bun';
const hubAvailable = existsSync(hubEntry);

/** faux 剧本：一次文本回复（reply）。 */
const REPLY_SCRIPT = JSON.stringify([{ kind: 'reply', text: '收到' }]);
/** faux 剧本：先长延迟（可中止面）后回复。 */
const DELAY_SCRIPT = JSON.stringify([{ kind: 'delay', ms: 30_000 }]);

interface Harness {
  runtime: PaiRuntime;
  monitor: ReturnType<typeof createRuntimeMonitor>;
  invoke: (method: string, params: unknown) => Promise<{ ok: boolean }>;
  events: string[];
  /** 最近一次 confirm 弹窗的 requestId（bash 应答面）。 */
  lastDialogRequestId: () => string | null;
  work: string;
  agentDir: string;
  home: string;
}

const harnesses: Harness[] = [];

/** 装配真实主进程链路（runtime + routes + monitor）；faux 经 extraSpawnEnv 注入缝。 */
function makeHarness(fauxScript: string): Harness {
  const work = mkdtempSync(join(tmpdir(), 't38-e2e-'));
  const agentDir = join(work, 'agent');
  const home = join(work, 'home');
  mkdirSync(home, { recursive: true });
  // agent 定义/技能目录 ~/.my-agent 走 HOME：bun 的 os.homedir() 启动即缓存，
  // 进程内 HOME 重定向对 store 无效——store 经 homeDir 注入缝隔离；
  // hub 侧 skills 的 user 目录解析用进程 HOME（对 host 子进程生效）
  process.env['HOME'] = home;
  // 种一个用户级技能（hub skills 域 = 平铺 .md + frontmatter；bundled 目录在
  // my-agent 仓库当前为空——种子保证清单面可断言）
  mkdirSync(join(home, '.my-agent', 'skills'), { recursive: true });
  writeFileSync(join(home, '.my-agent', 'skills', 'demo-skill.md'), '---\nname: demo-skill\ndescription: Demo skill for the integration journey\n---\nDemo body.\n');
  const keyStore: ProviderKeyStore = {
    encryptionAvailable: false,
    getKey: () => null,
    setKey: () => undefined,
    keyNames: [],
  };
  const events: string[] = [];
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
    extraSpawnEnv: () => ({ HUB_WORKER_PROVIDER: 'faux', HUB_FAUX_SCRIPT: fauxScript }),
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
  const harness: Harness = { runtime, monitor, invoke: (m, p) => routes.invoke(m, p) as Promise<{ ok: boolean }>, events, lastDialogRequestId: () => lastDialog, work, agentDir, home };
  harnesses.push(harness);
  return harness;
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

/** 读会话 WAL 行并解析事件类型集合。 */
function walEvents(transcriptPath: string): Array<Record<string, unknown>> {
  const text = readFileSync(transcriptPath, 'utf8');
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

describe('app API 全接口 × 真 host-hub（faux 默认门）', () => {
  test(hubAvailable ? '全接口旅程 + 落存储断言' : '全接口旅程（跳过：hub 入口不存在）', async () => {
    if (!hubAvailable) {
      expect(hubAvailable).toBe(false);
      return;
    }
    const h = makeHarness(REPLY_SCRIPT);
    await h.runtime.start();
    expect(h.runtime.host.phase).toBe('ready');

    // --- bootstrap：get_models + list_saved 聚合（无渠道 → 空模型面合法） ---
    const bootstrap = (await h.invoke('app/bootstrap', {})) as { ok: boolean; data: { models: unknown[]; saved: unknown[]; hostPhase: string } };
    expect(bootstrap.ok).toBe(true);
    expect(bootstrap.data.hostPhase).toBe('ready');

    // --- 会话生命周期：start → transcript 骨架落盘 ---
    const started = (await h.invoke('session/start', { cwd: h.work, trusted: true })) as { ok: boolean; data: { threadId: string; sessionPath: string } };
    expect(started.ok).toBe(true);
    const threadId = started.data.threadId;
    const sessionPath = started.data.sessionPath;
    expect(existsSync(sessionPath)).toBe(true);
    // hub 对 cwd 做 realpath 归一（normalizeCwd）——macOS /var → /private/var 符号链接展开
    expect(h.runtime.registry.get(threadId)?.cwd).toBe(realpathSync(h.work));

    // --- prompt：受理即答 + settled 终态 + 流式词表事件 ---
    const prompted = await h.invoke('session/prompt', { threadId, message: '只回复两个字：收到' });
    expect(prompted.ok).toBe(true);
    expect(await waitFor(() => h.events.includes('turnSettled'), 60_000)).toBe(true);
    expect(h.events).toContain('turnStarted');
    expect(h.events).toContain('messageFinal');

    // --- WAL 落存储：session_init + user/assistant message ---
    const rows = walEvents(sessionPath);
    const types = rows.map((row) => (row['event'] as Record<string, unknown> | undefined)?.['type']);
    expect(types).toContain('session_init');
    expect(types).toContain('message');

    // --- entries：seq 游标域 + 增量窗口 ---
    const entries = (await h.invoke('session/entries', { threadId })) as { ok: boolean; data: { items: Array<{ kind: string }>; cursor: number | null } };
    expect(entries.ok).toBe(true);
    const kinds = entries.data.items.map((item) => item.kind);
    expect(kinds).toContain('user');
    expect(kinds).toContain('assistant');
    const cursor = entries.data.cursor;
    expect(typeof cursor).toBe('number');
    const delta = (await h.invoke('session/entries', { threadId, since: cursor })) as { ok: boolean; data: { items: unknown[] } };
    expect(delta.ok).toBe(true);

    // --- state / inflight / stats ---
    const state = (await h.invoke('session/state', { threadId })) as { ok: boolean; data: { isStreaming: boolean; queue: { steering: string[] } } };
    expect(state.ok).toBe(true);
    expect(state.data.isStreaming).toBe(false);
    const inflight = (await h.invoke('session/inflight', { threadId })) as { ok: boolean; data: { turnStartSeq: number | null } };
    expect(inflight.ok).toBe(true);
    const stats = (await h.invoke('session/stats', { threadId })) as { ok: boolean; data: { tokens: { total: number } } };
    expect(stats.ok).toBe(true);
    expect(stats.data.tokens.total).toBeGreaterThan(0);

    // --- 子代理读口（faux 无子代理 → 空形态）与 steer 错误路径 ---
    const subagents = (await h.invoke('session/subagents', { threadId })) as { ok: boolean; data: { subagents: unknown[] } };
    expect(subagents.ok).toBe(true);
    expect(subagents.data.subagents).toEqual([]);
    const steer = await h.invoke('subagent/steer', { threadId, agentId: 'nonexistent', message: 'hi' });
    expect((steer as { ok: boolean }).ok).toBe(false);

    // --- setName → WAL session_meta ---
    const renamed = await h.invoke('session/setName', { threadId, name: '集成旅程' });
    expect(renamed.ok).toBe(true);
    expect(await waitFor(() => walEvents(sessionPath).some((row) => (row['event'] as Record<string, unknown> | undefined)?.['type'] === 'session_meta'), 15_000)).toBe(true);

    // --- setModel（下一轮生效；faux 模式下 worker 拨号表只有 faux——T38 装置口径） ---
    const setModel = await h.invoke('session/setModel', { threadId, provider: 'faux', modelId: 'faux-1' });
    expect(setModel.ok).toBe(true);
    // --- setThinking：预算校验双路径（faux-1 maxTokens 8192：high 16384 拒、low 2048 过） ---
    const tooHigh = await h.invoke('session/setThinking', { threadId, level: 'high' });
    expect((tooHigh as { ok: boolean }).ok).toBe(false);
    const setThinking = await h.invoke('session/setThinking', { threadId, level: 'low' });
    expect(setThinking.ok).toBe(true);
    const thinking = (await h.invoke('session/thinkingLevels', { threadId })) as { ok: boolean; data: { level: string; source: string } };
    expect(thinking.ok).toBe(true);
    expect(thinking.data.level).toBe('low');
    expect(thinking.data.source).toBe('session');

    // --- 权限模式：setMode → mode 读回 ---
    const setMode = await h.invoke('permission/setMode', { threadId, mode: 'acceptEdits' });
    expect(setMode.ok).toBe(true);
    const mode = (await h.invoke('permission/mode', { threadId })) as { ok: boolean; data: { mode: string } };
    expect(mode.ok).toBe(true);
    expect(mode.data.mode).toBe('acceptEdits');

    // --- hub 用户级设置：写 → hub-settings.json 落盘 ---
    const setHub = await h.invoke('app/setHubSettings', { permissionDefaultMode: 'default', thinkingDefault: 'low' });
    expect(setHub.ok).toBe(true);
    expect(await waitFor(() => existsSync(join(h.agentDir, 'hub-settings.json')), 10_000)).toBe(true);
    const hubSettings = JSON.parse(readFileSync(join(h.agentDir, 'hub-settings.json'), 'utf8')) as Record<string, unknown>;
    expect(hubSettings['permission.defaultMode']).toBe('default');
    const hubRead = (await h.invoke('app/hubSettings', {})) as { ok: boolean; data: { permissionDefaultMode: string | null; thinkingDefault: string | null } };
    expect(hubRead.ok).toBe(true);
    expect(hubRead.data.thinkingDefault).toBe('low');

    // --- 技能面：hub skills/list（种子可见）+ preview 目录 + 禁用 ---
    const skills = (await h.invoke('skills/list', {})) as { ok: boolean; data: Array<{ name: string; enabled: boolean }> };
    expect(skills.ok).toBe(true);
    expect(skills.data.some((item) => item.name === 'demo-skill' && item.enabled)).toBe(true);
    const preview = (await h.invoke('command/preview', {})) as { ok: boolean; data: Array<{ name: string; source: string }> };
    expect(preview.ok).toBe(true);
    expect(preview.data.some((item) => item.name === 'skill:demo-skill')).toBe(true);
    const disabled = (await h.invoke('skills/setEnabled', { name: 'demo-skill', enabled: false })) as { ok: boolean; data: Array<{ name: string; enabled: boolean }> };
    expect(disabled.ok).toBe(true);
    expect(disabled.data.some((item) => item.name === 'demo-skill' && !item.enabled)).toBe(true);

    // --- 命令目录（builtin compact 注入） ---
    const commands = (await h.invoke('command/list', { threadId })) as { ok: boolean; data: Array<{ name: string; source: string }> };
    expect(commands.ok).toBe(true);
    expect(commands.data.some((item) => item.name === 'compact')).toBe(true);

    // --- agent 定义：upsert → ~/.my-agent/agents/<name>.md（HOME 隔离）→ remove ---
    const definition = { name: 'code-reviewer', description: 'Review code for defects', systemPrompt: 'You review code.', tools: ['read_file', 'grep'] as string[] | null, model: null as string | null, scope: 'user' as const, project: null };
    const upserted = await h.invoke('agent/upsert', { definition, previous: null });
    expect(upserted.ok).toBe(true);
    const agentFile = join(h.home, '.my-agent', 'agents', 'code-reviewer.md');
    expect(existsSync(agentFile)).toBe(true);
    const listed = (await h.invoke('agent/definitions', {})) as { ok: boolean; data: Array<{ name: string }> };
    expect(listed.data.some((item) => item.name === 'code-reviewer')).toBe(true);
    const removed = await h.invoke('agent/remove', { name: 'code-reviewer', scope: 'user', project: null });
    expect(removed.ok).toBe(true);
    expect(existsSync(agentFile)).toBe(false);

    // --- fork：seq 域 → 新会话 + fork 落存储 ---
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

    // --- abort：delay 剧本中止面（独立 harness——faux 剧本随 spawn env 固定） ---
    const d = makeHarness(DELAY_SCRIPT);
    await d.runtime.start();
    expect(d.runtime.host.phase).toBe('ready');
    // 事件面在 bootstrap 前缓冲（EVENT_BUFFER）——先开门再断言事件流
    await d.invoke('app/bootstrap', {});
    const delaySession = (await d.invoke('session/start', { cwd: d.work })) as { ok: boolean; data: { threadId: string } };
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
    const resumed = (await d.invoke('session/resume', { sessionPath: join(d.agentDir, 'sessions', delaySession.data.threadId, 'transcript.jsonl') })) as { ok: boolean; data: { threadId: string } };
    expect(resumed.ok).toBe(true);
    expect(resumed.data.threadId).toBe(delaySession.data.threadId);

    // --- keepalive：注册表持久真相 ---
    const keepalive = await d.invoke('session/setKeepalive', { threadId: delaySession.data.threadId, keepalive: true });
    expect(keepalive.ok).toBe(true);
    expect(d.runtime.registry.get(delaySession.data.threadId)?.keepalive).toBe(true);

    // --- 闲置档位：set_idle_retire_ms（value 域） ---
    const idle = await d.invoke('app/setIdleRecycle', { minutes: 15 });
    expect(idle.ok).toBe(true);

    // --- listSaved：标题可见 ---
    const saved = (await h.invoke('session/listSaved', {})) as { ok: boolean; data: Array<{ sessionPath: string; name: string | null }> };
    expect(saved.ok).toBe(true);
    expect(saved.data.some((item) => item.name === '集成旅程')).toBe(true);

    // --- forceRetire / stop：收编与注册表收敛 ---
    const forced = await d.invoke('session/forceRetire', { threadId: delaySession.data.threadId });
    expect(forced.ok).toBe(true);
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

    // --- models.json 落盘形状（hub 扁平 models[]） ---
    const modelsFile = JSON.parse(readFileSync(join(h.agentDir, 'models.json'), 'utf8')) as { models: unknown[] };
    expect(Array.isArray(modelsFile.models)).toBe(true);
  }, 300_000);
});

describe('app API × 真 host-hub（GLM 真门，opt-in）', () => {
  const e2eEnabled = process.env['PAI_E2E'] === '1';
  const glmKey = process.env['GLM_API_KEY'] ?? '';
  const glmModel = process.env['GLM_MODEL'] ?? '';
  const glmBaseUrl = (process.env['GLM_BASE_URL'] ?? '').replace(/\/chat\/completions$/, '');
  const runnable = e2eEnabled && hubAvailable && glmKey.length > 0 && glmModel.length > 0 && glmBaseUrl.length > 0;

  // 真凭证旅程：GLM 预设裸 id 端点不认（T38 挂账）——走 app 渠道条目（models.json custom）
  test(runnable ? 'GLM 全旅程：custom 渠道 → start(modelId) → prompt settled → entries → stop' : 'GLM 全旅程（跳过：未开启或缺凭证）', async () => {
    if (!runnable) {
      expect(runnable).toBe(false);
      return;
    }
    const work = mkdtempSync(join(tmpdir(), 't38-glm-'));
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
      providers: () => [{ name: 'glm-e2e', baseUrl: glmBaseUrl, api: 'anthropic-messages', models: [{ id: glmModel, reasoning: true, vision: false }] }],
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
    harnesses.push({ runtime, monitor, invoke: (m, p) => routes.invoke(m, p) as Promise<{ ok: boolean }>, events, lastDialogRequestId: () => null, work, agentDir: join(work, 'agent'), home: work });
    await runtime.start();
    expect(runtime.host.phase).toBe('ready');

    const started = (await routes.invoke('session/start', { cwd: work, modelId: glmModel, trusted: true })) as { ok: boolean; data: { threadId: string } };
    expect(started.ok).toBe(true);
    const threadId = started.data.threadId;
    const prompted = (await routes.invoke('session/prompt', { threadId, message: '只回复两个字：收到' })) as { ok: boolean };
    expect(prompted.ok).toBe(true);
    expect(await waitFor(() => events.includes('turnSettled'), 90_000)).toBe(true);
    const entries = (await routes.invoke('session/entries', { threadId })) as { ok: boolean; data: { items: Array<{ kind: string }> } };
    expect(entries.ok).toBe(true);
    expect(entries.data.items.map((item) => item.kind)).toContain('assistant');
    const stopped = (await routes.invoke('session/stop', { threadId, remove: true })) as { ok: boolean };
    expect(stopped.ok).toBe(true);
  }, 240_000);
});
