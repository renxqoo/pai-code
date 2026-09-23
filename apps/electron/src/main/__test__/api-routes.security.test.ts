import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { HostCommandOutcome, HostPhase, HostProcessPort, HubFrame, PaiCommand } from "@paiapp/contracts";

import { createApiRoutes } from "../api-routes";
import { createSettingsRoutes } from '@paiapp/api';
import { createAgentDefinitionsStore } from "../agent-definitions-store";
import { createSkillImporter } from "../skill-import";
import { createFileSettings, type ProviderKeyStore } from "../file-settings";
import { createPaiRuntime } from "../pai-runtime";
import { createRuntimeMonitor } from '@paiapp/infra';

/**
 * 路由安全面回归（对抗审查 C-S2/C-S8/C-S4）：
 * session/resume 白名单（任意路径读取面）、provider 名 sanitize 碰撞与 hub 预设键
 * 撞键、api 词表、host 未启动时全部走 {ok:false} 而非 rejected promise；
 * 权限模式与 hub 设置走 hub 命令面（permission/get_mode|set_mode、settings/get|set）。
 */

const keyStore: ProviderKeyStore = {
  encryptionAvailable: false,
  getKey: () => null,
  setKey: () => undefined,
  keyNames: [],
};

/** fake host：get_models 回预设目录（撞键判定源）；其余命令成功并记账。 */
function fakeHost(models: Array<Record<string, unknown>>): { port: HostProcessPort; sent: PaiCommand[] } {
  const sent: PaiCommand[] = [];
  const port: HostProcessPort = {
    get phase(): HostPhase {
      return "ready";
    },
    request: (command: PaiCommand): Promise<HostCommandOutcome> => {
      sent.push(command);
      if (command.type === "get_models") return Promise.resolve({ ok: true, data: models });
      if (command.type === "permission/get_mode") return Promise.resolve({ ok: true, data: { mode: "default", source: "user" } });
      if (command.type === "settings/get") {
        return Promise.resolve({ ok: true, data: { values: { "permission.defaultMode": "default", "thinking.default": "low" } } });
      }
      return Promise.resolve({ ok: true, data: {} });
    },
    onFrame: (_cb: (frame: HubFrame) => void) => () => undefined,
    onPhase: () => () => undefined,
    restart: () => Promise.resolve(),
    dispose: () => Promise.resolve(),
    diagnostics: () => ({ stderrTail: "", restartCount: 0, lastRestartCause: null, lastRestartAt: null }),
  };
  return { port, sent };
}

async function makeRoutes(work: string, options: { models?: Array<Record<string, unknown>> } = {}) {
  const agentDir = join(work, "agent");
  const home = join(work, "home");
  mkdirSync(join(agentDir, "sessions"), { recursive: true });
  // hubEntry 只需真实存在（start 的 existsSync 门）；host 本体由 fake 注入
  writeFileSync(join(work, "cli.js"), "");
  const settings = createFileSettings(join(work, "settings.json"), keyStore);
  const host = options.models !== undefined ? fakeHost(options.models) : null;
  const runtime = createPaiRuntime({
    paths: {
      userDataDir: work,
      agentDir,
      registryDb: join(work, "r.sqlite"),
      settingsFile: join(work, "s.json"),
      providerKeysFile: join(work, "k.json"),
      logFile: join(work, "l.log"),
    },
    keyStore,
    providers: () => [],
    idleRecycleMinutes: () => 5,
    // 无 models 注入 = host 从不构建（hub 路径未解析的运行时形态）
    hubPaths: () => (host === null ? null : { bunPath: "bun", hubEntry: join(work, "cli.js") }),
    logger: { log: () => undefined },
    emit: () => undefined,
    createHost: () => host?.port ?? fakeHost([]).port,
  });
  if (host !== null) await runtime.start();
  const audits: string[] = [];
  const routes = createApiRoutes({
    runtime,
    settings,
    keyStore,
    audit: (m) => audits.push(m),
    agentDefinitions: createAgentDefinitionsStore(home),
    agentDir,
    revealPath: () => undefined,
    pickDirectory: () => Promise.resolve(null),
    skillImporter: createSkillImporter({ homeDir: home }),
    exportDiagnosticsBundle: () => work,
    monitor: createRuntimeMonitor({ host: () => null, hub: () => null, appMetrics: () => ({ rssBytes: null, cpuPercent: null }), systemMemory: () => ({ totalBytes: null, availableBytes: null }), idleRecycleMinutes: () => 5, appVersion: () => 'test' }),
  });
  return { routes, audits, agentDir, home, sent: host?.sent ?? [], runtime };
}

describe("api-routes 安全面（C-S2/C-S8/C-S4）", () => {
  test("C-S2：session/resume 白名单——目录外/穿越拒绝，目录内放行（macOS 符号链接归一）", async () => {
    const work = mkdtempSync(join(tmpdir(), "pai-sec-route-"));
    const { routes, agentDir } = await makeRoutes(work);
    const outside = join(work, "outside");
    mkdirSync(outside, { recursive: true });
    writeFileSync(join(outside, "evil.jsonl"), "{}\n");

    const evil = (await routes.invoke("session/resume", {
      sessionPath: join(outside, "evil.jsonl"),
    })) as { ok: boolean; error?: { kind: string; message?: string } };
    expect(evil).toEqual({ ok: false, error: { kind: "session_path_forbidden" } });

    const traversal = (await routes.invoke("session/resume", {
      sessionPath: `${agentDir}/sessions/../../outside/evil.jsonl`,
    })) as { ok: boolean; error?: { kind: string; message?: string } };
    expect(traversal).toEqual({ ok: false, error: { kind: "session_path_forbidden" } });

    // 白名单内：到达 host（此处 host 不可用 → host_unavailable，证明未被白名单拦截）
    const inside = (await routes.invoke("session/resume", {
      sessionPath: join(agentDir, "sessions", "ok.jsonl"),
    })) as {
      ok: boolean;
      error?: { kind: string; face?: string };
    };
    expect(inside).toEqual({ ok: false, error: { kind: "transient", face: "host_unavailable" } });
  });

  test("C-S 技能源白名单：批准根之外的 sourcePath 拒绝（candidates/import 双口；防把 ~/.ssh 拷进技能根）", async () => {
    const work = mkdtempSync(join(tmpdir(), "pai-sec-skill-"));
    const { routes, home } = await makeRoutes(work, { models: [] });
    const outside = join(work, "secrets");
    mkdirSync(outside, { recursive: true });
    writeFileSync(join(outside, "SKILL.md"), "---\nname: evil\ndescription: d\n---\n");
    // 真实路径归一后不在批准根（home 下三个内置源根）之下 → 双口皆拒
    const candidates = (await routes.invoke("skills/candidates", { sourcePath: outside })) as {
      ok: boolean;
      error?: { kind: string };
    };
    expect(candidates.ok).toBe(false);
    expect(candidates.error?.kind).toBe("skill_source_invalid");
    const imported = (await routes.invoke("skills/import", { sourcePath: outside, overwrite: false })) as {
      ok: boolean;
      error?: { kind: string };
    };
    expect(imported.ok).toBe(false);
    expect(imported.error?.kind).toBe("skill_source_invalid");
    // 穿越形态同样拒绝（realpath 归一挡 `..`）
    const traversal = (await routes.invoke("skills/import", {
      sourcePath: join(home, ".agents", "skills", "..", "..", "..", "secrets"),
      overwrite: false,
    })) as { ok: boolean; error?: { kind: string } };
    expect(traversal.error?.kind).toBe("skill_source_invalid");
  });

  test("C-S8：provider 名 sanitize 碰撞拒绝（a-b 与 a_b 同映射 PAI_KEY_A_B）", async () => {
    const work = mkdtempSync(join(tmpdir(), "pai-sec-collide-"));
    const { routes } = await makeRoutes(work, { models: [] });
    const first = (await routes.invoke("provider/upsert", {
      name: "a-b",
      baseUrl: "https://a.example.com",
      api: "openai",
      models: [{ id: "m", reasoning: false, vision: false }],
    })) as { ok: boolean };
    expect(first.ok).toBe(true);
    const collide = (await routes.invoke("provider/upsert", {
      name: "a_b",
      baseUrl: "https://b.example.com",
      api: "openai",
      models: [{ id: "m", reasoning: false, vision: false }],
    })) as { ok: boolean; error?: { kind: string; message?: string } };
    expect(collide).toEqual({ ok: false, error: { kind: "provider_name_conflict" } });
    // 同名更新自身合法（baseUrl 不变；换端点必须重录 key——provider_baseurl_changed 拒绝）
    const self = (await routes.invoke("provider/upsert", {
      name: "a-b",
      baseUrl: "https://a.example.com",
      api: "openai",
      models: [{ id: "m2", reasoning: true, vision: false }],
    })) as { ok: boolean };
    expect(self.ok).toBe(true);
    const endpointChanged = (await routes.invoke("provider/upsert", {
      name: "a-b",
      baseUrl: "https://a2.example.com",
      api: "openai",
      models: [{ id: "m2", reasoning: true, vision: false }],
    })) as { ok: boolean; error?: { kind: string } };
    expect(endpointChanged).toEqual({ ok: false, error: { kind: "provider_baseurl_changed" } });
  });

  test("撞内置预设名 = 用户覆盖放行（x-harness 整档覆盖 + 消歧 custom 优先——app 无「预设挡人」面）；api 词表外拒绝", async () => {
    const work = mkdtempSync(join(tmpdir(), "pai-sec-preset-"));
    const { routes } = await makeRoutes(work, { models: [{ id: "glm-5.3", provider: "glm", source: "preset" }] });
    const preset = (await routes.invoke("provider/upsert", {
      name: "glm",
      baseUrl: "https://x.example.com",
      api: "openai",
      models: [{ id: "m", reasoning: false, vision: false }],
    })) as { ok: boolean; error?: { kind: string; message?: string } };
    expect(preset.ok).toBe(true);
    const badApi = (await routes.invoke("provider/upsert", {
      name: "custom",
      baseUrl: "https://x.example.com",
      api: "pi-messages",
      models: [{ id: "m", reasoning: false, vision: false }],
    })) as { ok: boolean; error?: { kind: string; message?: string } };
    expect(badApi).toEqual({ ok: false, error: { kind: "provider_api_unsupported" } });
  });

  test("C-S4：host 未启动时 provider/upsert 照常落盘（目录只在 spawn 期读入——保存不依赖 host）；bootstrap 全走 outcome 不 reject；remove 照常", async () => {
    const work = mkdtempSync(join(tmpdir(), "pai-sec-contract-"));
    const { routes } = await makeRoutes(work);
    const upserted = (await routes.invoke("provider/upsert", {
      name: "glm",
      baseUrl: "https://x.example.com",
      api: "openai",
      models: [
        { id: "m", reasoning: false, vision: false, contextWindow: 200000, maxTokens: 8192 },
      ],
    })) as { ok: boolean; error?: { kind: string; message?: string } };
    expect(upserted.ok).toBe(true);
    const bootstrap = (await routes.invoke("app/bootstrap", {})) as { ok: boolean; data: unknown };
    expect(bootstrap.ok).toBe(true);
    await expect(routes.invoke("provider/remove", { name: "glm" })).resolves.toMatchObject({
      ok: true,
    });
  });

  test("host 可用：带模型参数的 upsert 全链通过且参数进回读视图", async () => {
    const work = mkdtempSync(join(tmpdir(), "pai-sec-upsert-"));
    const { routes } = await makeRoutes(work, { models: [] });
    const upserted = (await routes.invoke("provider/upsert", {
      name: "glm",
      baseUrl: "https://x.example.com",
      api: "openai",
      models: [
        { id: "m", reasoning: false, vision: false, contextWindow: 200000, maxTokens: 8192 },
      ],
    })) as {
      ok: boolean;
      data?: Array<{
        name: string;
        models: Array<{ id: string; contextWindow?: number; maxTokens?: number }>;
      }>;
    };
    expect(upserted.ok).toBe(true);
    expect(upserted.data?.[0]?.models[0]).toMatchObject({
      id: "m",
      contextWindow: 200000,
      maxTokens: 8192,
    });
  });

  test("S6：dialog/respond 权限应答落审计日志", async () => {
    const work = mkdtempSync(join(tmpdir(), "pai-sec-audit-"));
    const { routes, audits } = await makeRoutes(work);
    await routes.invoke("dialog/respond", { requestId: "r1", payload: { confirmed: true } });
    await routes.invoke("dialog/respond", { requestId: "r2", payload: { cancelled: true } });
    expect(audits).toContain("dialog_respond:r1:confirmed");
    expect(audits).toContain("dialog_respond:r2:cancelled");
  });
});

describe("api-routes 权限模式与 hub 设置（hub 命令面）", () => {
  test("permission/mode：permission/get_mode 收窄 {mode,source}；词表外 source 降级 default", async () => {
    const work = mkdtempSync(join(tmpdir(), "pai-sec-permmode-"));
    const { routes } = await makeRoutes(work, { models: [] });
    const mode = (await routes.invoke("permission/mode", { threadId: "t1" })) as {
      ok: boolean;
      data: { mode: string; source: string };
    };
    expect(mode).toEqual({ ok: true, data: { mode: "default", source: "user" } });
  });

  test("permission/setMode：permission/set_mode 透传 + 审计；词表外 mode 拒绝", async () => {
    const work = mkdtempSync(join(tmpdir(), "pai-sec-permset-"));
    const { routes, audits, sent } = await makeRoutes(work, { models: [] });
    const ok = (await routes.invoke("permission/setMode", { threadId: "t1", mode: "auto" })) as { ok: boolean };
    expect(ok.ok).toBe(true);
    expect(sent.find((command) => command.type === "permission/set_mode")).toMatchObject({
      type: "permission/set_mode",
      threadId: "t1",
      mode: "auto",
    });
    expect(audits).toContain("permission_mode:t1:auto");
    const bad = (await routes.invoke("permission/setMode", { threadId: "t1", mode: "yolo" })) as { ok: boolean; error?: { kind: string; message?: string } };
    expect(bad).toEqual({ ok: false, error: { kind: "invalid_params" } });
  });

  test("app/hubSettings：settings/get values 收窄（未设置键 → null）", async () => {
    const work = mkdtempSync(join(tmpdir(), "pai-sec-hubget-"));
    const { routes } = await makeRoutes(work, { models: [] });
    const hub = (await routes.invoke("app/hubSettings", {})) as {
      ok: boolean;
      data: { permissionDefaultMode: string | null; thinkingDefault: string | null };
    };
    expect(hub).toEqual({ ok: true, data: { permissionDefaultMode: "auto", thinkingDefault: "low" } });
  });

  test("app/setHubSettings：settings/set 按键写（permission.defaultMode / thinking.default）", async () => {
    const work = mkdtempSync(join(tmpdir(), "pai-sec-hubset-"));
    const { routes, sent } = await makeRoutes(work, { models: [] });
    const outcome = (await routes.invoke("app/setHubSettings", { permissionDefaultMode: "full", thinkingDefault: "high" })) as { ok: boolean };
    expect(outcome.ok).toBe(true);
    const sets = sent.filter((command) => command.type === "settings/set");
    expect(sets).toEqual([
      { type: "settings/set", key: "permission.defaultMode", value: "full" },
      { type: "settings/set", key: "thinking.default", value: "high" },
    ]);
  });

  test("session/start 带 trusted 落审计（host 未启动 → ok:false 但审计先行）", async () => {
    const work = mkdtempSync(join(tmpdir(), "pai-sec-trust-"));
    const { routes, audits } = await makeRoutes(work);
    const outcome = (await routes.invoke("session/start", { cwd: "/w", trusted: true })) as {
      ok: boolean;
    };
    expect(outcome.ok).toBe(false);
    expect(audits.some((line) => line.startsWith("session_trusted:start:/w:true"))).toBe(true);
  });
});

describe("api-routes 门禁（第三波审查补：file/search 与 reveal）", () => {
  test("file/search：越界 cwd 拒绝 cwd_forbidden；已知 cwd（含 .. 归一）放行", async () => {
    const work = mkdtempSync(join(tmpdir(), "pai-sec-search-"));
    const { routes } = await makeRoutes(work);
    const agentDir = join(work, "agent");
    mkdirSync(join(agentDir, "sessions"), { recursive: true });
    writeFileSync(join(agentDir, "sessions", "a.jsonl"), "{}", "utf8");

    const forbidden = (await routes.invoke("file/search", { cwd: "/etc", query: "" })) as {
      ok: boolean;
      error?: { kind: string };
    };
    expect(forbidden.ok).toBe(false);
    expect(forbidden.error).toEqual({ kind: "cwd_forbidden" });

    const escape = (await routes.invoke("file/search", {
      cwd: `${agentDir}/../..`,
      query: "",
    })) as { ok: boolean; error?: { kind: string; message?: string } };
    expect(escape.ok).toBe(false);
    expect(escape.error).toEqual({ kind: "cwd_forbidden" });
  });

  test("session/reveal：白名单外路径拒绝，目录内放行", async () => {
    const work = mkdtempSync(join(tmpdir(), "pai-sec-reveal-"));
    const revealed: string[] = [];
    const agentDir = join(work, "agent");
    mkdirSync(join(agentDir, "sessions"), { recursive: true });
    const sessionFile = join(agentDir, "sessions", "a.jsonl");
    writeFileSync(sessionFile, "{}", "utf8");
    const settings = createFileSettings(join(work, "s.json"), keyStore);
    const runtime = createPaiRuntime({
      paths: {
        userDataDir: work,
        agentDir,
        registryDb: join(work, "r.sqlite"),
        settingsFile: join(work, "s.json"),
        providerKeysFile: join(work, "k.json"),
        logFile: join(work, "l.log"),
      },
      keyStore,
      providers: () => [],
      idleRecycleMinutes: () => 5,
      hubPaths: () => ({ bunPath: "bun", hubEntry: "/nonexistent/cli.js" }),
      logger: { log: () => undefined },
      emit: () => undefined,
    });
    const routes = createApiRoutes({
      runtime,
      settings,
      keyStore,
      audit: () => undefined,
      agentDefinitions: createAgentDefinitionsStore(join(work, "home")),
      agentDir,
      revealPath: (path) => revealed.push(path),
      pickDirectory: () => Promise.resolve(null),
      exportDiagnosticsBundle: () => work,
      monitor: createRuntimeMonitor({ host: () => null, hub: () => null, appMetrics: () => ({ rssBytes: null, cpuPercent: null }), systemMemory: () => ({ totalBytes: null, availableBytes: null }), idleRecycleMinutes: () => 5, appVersion: () => 'test' }),
    });
    const outside = (await routes.invoke("session/reveal", { sessionPath: "/etc/passwd" })) as {
      ok: boolean;
      error?: { kind: string };
    };
    expect(outside.ok).toBe(false);
    expect(outside.error).toEqual({ kind: "session_path_forbidden" });
    const inside = (await routes.invoke("session/reveal", { sessionPath: sessionFile })) as {
      ok: boolean;
    };
    expect(inside.ok).toBe(true);
    expect(revealed).toEqual([sessionFile]);
  });
});

describe("api-routes agent 定义面（T20）", () => {
  test("upsert user 级落位 + audit；project 未知目录拒绝（已知集合为空）；remove 落 audit", async () => {
    const work = mkdtempSync(join(tmpdir(), "pai-sec-agent-"));
    // user 级 CRUD 走 hub 命令（D6）——需 fake host 在场
    const { routes, audits, sent } = await makeRoutes(work, { models: [] });
    const definition = {
      name: "search",
      description: "d",
      systemPrompt: "p",
      tools: null,
      model: null,
      scope: "user",
      project: null,
    };
    const upsert = (await routes.invoke("agent/upsert", { definition, previous: null })) as {
      ok: boolean;
    };
    expect(upsert.ok).toBe(true);
    // host-hub renderAgentTypeMd 同构：无 name 字段（name ≡ 文件主干）
    // user 级写路径走 hub 命令（D6：round-trip 由 hub 保证，文件落位断言归集成门）
    expect(sent.find((command) => command.type === "agents/create")).toMatchObject({
      type: "agents/create",
      name: "search",
      description: "d",
    });
    // host 未启动 → 已知项目集合为空 → project 作用域一律拒绝
    const rejected = (await routes.invoke("agent/upsert", {
      definition: { ...definition, scope: "project", project: "/nowhere" },
      previous: null,
    })) as { ok: boolean; error?: { kind: string; message?: string } };
    expect(rejected).toEqual({ ok: false, error: { kind: "invalid_params", message: "invalid_project" } });
    const removed = (await routes.invoke("agent/remove", {
      name: "search",
      scope: "user",
      project: null,
    })) as { ok: boolean };
    expect(removed.ok).toBe(true);
    expect(audits).toContain("agent_upsert: user/search");
    expect(audits).toContain("agent_remove: user/search");
  });
});

describe("api-routes 收敛读口门禁（T35 对抗审查补：新方法必须走同一注册表校验）", () => {
  test("三个新读口缺 threadId → invalid_params（不落 host_unavailable）", async () => {
    const work = mkdtempSync(join(tmpdir(), "pai-sec-inflight-"));
    const { routes } = await makeRoutes(work);
    for (const method of ["session/inflight", "session/subagents", "session/pendingDialogs"] as const) {
      const bad = (await routes.invoke(method, {})) as { ok: boolean; error?: { kind: string; message?: string } };
      expect({ method, bad }).toEqual({ method, bad: { ok: false, error: { kind: "invalid_params" } } });
      // 合法参数：本装置无 host → host_unavailable（证明未被门禁误拦，且确实透传到 host 命令）
      const ok = (await routes.invoke(method, { threadId: "t1" })) as { ok: boolean; error?: { kind: string; message?: string } };
      expect({ method, ok }).toEqual({ method, ok: { ok: false, error: { kind: "transient", face: "host_unavailable" } } });
    }
  });

  test("未注册方法 → unknown_method（白名单按 ApiSchemas 单一驱动）", async () => {
    const work = mkdtempSync(join(tmpdir(), "pai-sec-unknown-"));
    const { routes } = await makeRoutes(work);
    const out = (await routes.invoke("session/nope" as never, {})) as { ok: boolean; error?: { kind: string; message?: string } };
    expect(out).toEqual({ ok: false, error: { kind: "unknown_method", message: "session/nope" } });
  });

  test("退役方法不在白名单：permission/read|write → unknown_method", async () => {
    const work = mkdtempSync(join(tmpdir(), "pai-sec-retired-"));
    const { routes } = await makeRoutes(work);
    for (const method of ["permission/read", "permission/write"] as const) {
      const out = (await routes.invoke(method as never, {})) as { ok: boolean; error?: { kind: string; message?: string } };
      expect(out).toEqual({ ok: false, error: { kind: "unknown_method", message: method } });
    }
  });
});


describe("渠道数据迁移端到端（T38 症状：渠道无法保存——旧盘退役字段整档降级清空）", () => {
  test("旧 settings 带 thinkingFormat：读取迁移保留渠道 → upsert 新渠道 → 落盘全量保留", async () => {
    const work = mkdtempSync(join(tmpdir(), "t38-prov-migrate-"));
    const settingsFile = join(work, "settings.json");
    // 旧盘形态：providers 带退役字段 thinkingFormat
    writeFileSync(settingsFile, JSON.stringify({
      hubDev: { bunPath: null, hubEntry: null },
      providers: [
        { name: "GLM", baseUrl: "https://x.example.com", api: "openai", thinkingFormat: "zai",
          models: [{ id: "glm-4.7", reasoning: true, vision: false }] },
      ],
      trustedDefault: false, defaultModel: null, onboarded: true,
      projectModels: {}, pinnedSessions: [], archivedSessions: [], hiddenProjects: [], idleRecycleMinutes: 5,
    }, null, 2));
    const keyStore: ProviderKeyStore = { encryptionAvailable: false, getKey: () => null, setKey: () => undefined, keyNames: [] };
    const settings = createFileSettings(settingsFile, keyStore);
    const rejects: string[] = [];
    const settingsRoutes = createSettingsRoutes({
      settings,
      keyStore,
      restartHost: () => Promise.resolve(undefined),
      settingsCommands: () => ({
        get: () => Promise.resolve({ ok: true as const, data: {} }),
        set: () => Promise.resolve({ ok: true as const, data: {} }),
        listSkills: () => Promise.resolve({ ok: true as const, data: {} }),
        setSkillEnabled: () => Promise.resolve({ ok: true as const, data: {} }),
        setIdleRetireMs: () => Promise.resolve({ ok: true as const, data: {} }),
      }),
      onReject: (message) => rejects.push(message),
    });
    // 旧渠道在（迁移保留）
    expect(settings.listProviders().map((p) => p.name)).toEqual(["GLM"]);
    // 新渠道保存成功且不落任何拒绝
    const upsert = await settingsRoutes.routes["provider/upsert"]({ name: "Deepseek", baseUrl: "https://d.example.com", api: "anthropic", models: [{ id: "deepseek-chat", reasoning: false, vision: false }] });
    expect(upsert.ok).toBe(true);
    expect(rejects).toEqual([]);
    // 落盘全量保留（旧 + 新），且无退役字段
    const onDisk = JSON.parse(readFileSync(settingsFile, "utf8")) as { providers: Array<Record<string, unknown>> };
    expect(onDisk.providers.map((p) => p["name"]).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))).toEqual(["Deepseek", "GLM"]);
    expect(onDisk.providers.every((p) => !("thinkingFormat" in p))).toBe(true);
  });
});
