import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createApiRoutes } from "../api-routes";
import { createAgentDirFiles } from "../agent-dir-files";
import { createAgentDefinitionsStore } from "../agent-definitions-store";
import { createFileSettings, type ProviderKeyStore } from "../file-settings";
import { createPaiRuntime } from "../pai-runtime";

/**
 * 路由安全面回归（对抗审查 C-S2/C-S8/C-S4）：
 * session/resume 白名单（任意路径读取面）、provider 名 sanitize 碰撞、
 * host 未启动时全部走 {ok:false} 而非 rejected promise。
 */

const keyStore: ProviderKeyStore = {
  encryptionAvailable: false,
  getKey: () => null,
  setKey: () => undefined,
  keyNames: [],
};

function makeRoutes(work: string) {
  const agentDir = join(work, "agent");
  mkdirSync(join(agentDir, "sessions"), { recursive: true });
  const settings = createFileSettings(join(work, "settings.json"), keyStore);
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
    hubPaths: () => ({ bunPath: "bun", hubEntry: "/nonexistent/cli.js" }),
    logger: { log: () => undefined },
    emit: () => undefined,
  });
  const audits: string[] = [];
  const routes = createApiRoutes({
    runtime,
    settings,
    keyStore,
    audit: (m) => audits.push(m),
    agentDirFiles: createAgentDirFiles(agentDir),
    agentDefinitions: createAgentDefinitionsStore(agentDir),
    revealPath: () => undefined,
    pickDirectory: () => Promise.resolve(null),
  });
  return { routes, audits, agentDir };
}

describe("api-routes 安全面（C-S2/C-S8/C-S4）", () => {
  test("C-S2：session/resume 白名单——目录外/穿越拒绝，目录内放行（macOS 符号链接归一）", async () => {
    const work = mkdtempSync(join(tmpdir(), "pai-sec-route-"));
    const { routes, agentDir } = makeRoutes(work);
    const outside = join(work, "outside");
    mkdirSync(outside, { recursive: true });
    writeFileSync(join(outside, "evil.jsonl"), "{}\n");

    const evil = (await routes.invoke("session/resume", {
      sessionPath: join(outside, "evil.jsonl"),
    })) as { ok: boolean; reason?: string };
    expect(evil).toEqual({ ok: false, reason: "session_path_forbidden" });

    const traversal = (await routes.invoke("session/resume", {
      sessionPath: `${agentDir}/sessions/../../outside/evil.jsonl`,
    })) as { ok: boolean; reason?: string };
    expect(traversal).toEqual({ ok: false, reason: "session_path_forbidden" });

    // 白名单内：到达 host（此处 host 不可用 → host_unavailable，证明未被白名单拦截）
    const inside = (await routes.invoke("session/resume", {
      sessionPath: join(agentDir, "sessions", "ok.jsonl"),
    })) as {
      ok: boolean;
      reason?: string;
    };
    expect(inside).toEqual({ ok: false, reason: "host_unavailable" });
  });

  test("C-S8：provider 名 sanitize 碰撞拒绝（a-b 与 a_b 同映射 PAI_KEY_A_B）", async () => {
    const work = mkdtempSync(join(tmpdir(), "pai-sec-collide-"));
    const { routes } = makeRoutes(work);
    const first = (await routes.invoke("provider/upsert", {
      name: "a-b",
      baseUrl: "https://a.example.com",
      api: "openai-completions",
      models: [{ id: "m", reasoning: false, vision: false }],
    })) as { ok: boolean };
    expect(first.ok).toBe(true);
    const collide = (await routes.invoke("provider/upsert", {
      name: "a_b",
      baseUrl: "https://b.example.com",
      api: "openai-completions",
      models: [{ id: "m", reasoning: false, vision: false }],
    })) as { ok: boolean; reason?: string };
    expect(collide).toEqual({ ok: false, reason: "provider_name_conflict" });
    // 同名更新自身合法
    const self = (await routes.invoke("provider/upsert", {
      name: "a-b",
      baseUrl: "https://a2.example.com",
      api: "openai-completions",
      models: [{ id: "m2", reasoning: true, vision: false }],
    })) as { ok: boolean };
    expect(self.ok).toBe(true);
  });

  test("C-S4：host 未启动时 provider/upsert / app/bootstrap 全走 outcome 不 reject；配置落盘", async () => {
    const work = mkdtempSync(join(tmpdir(), "pai-sec-contract-"));
    const { routes } = makeRoutes(work);
    // 回归（对抗审查 P0-1）：带模型参数的 upsert 必须全链通过且参数进回读视图
    const upserted = (await routes.invoke("provider/upsert", {
      name: "glm",
      baseUrl: "https://x.example.com",
      api: "openai-completions",
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
    const bootstrap = (await routes.invoke("app/bootstrap", {})) as { ok: boolean; data: unknown };
    expect(bootstrap.ok).toBe(true);
    await expect(routes.invoke("provider/remove", { name: "glm" })).resolves.toMatchObject({
      ok: true,
    });
  });

  test("S6：dialog/respond 权限应答落审计日志", async () => {
    const work = mkdtempSync(join(tmpdir(), "pai-sec-audit-"));
    const { routes, audits } = makeRoutes(work);
    await routes.invoke("dialog/respond", { requestId: "r1", payload: { confirmed: true } });
    await routes.invoke("dialog/respond", { requestId: "r2", payload: { cancelled: true } });
    expect(audits).toContain("dialog_respond:r1:confirmed");
    expect(audits).toContain("dialog_respond:r2:cancelled");
  });
});

describe("api-routes 权限面（2d 对抗审查补）", () => {
  test("permission/write 畸形规则 → invalid_params；合法写入落盘且审计", async () => {
    const work = mkdtempSync(join(tmpdir(), "pai-sec-perm-"));
    const { routes, audits, agentDir } = makeRoutes(work);
    const bad = (await routes.invoke("permission/write", { rules: { mode: "yolo" } })) as {
      ok: boolean;
      reason?: string;
    };
    expect(bad.ok).toBe(false);
    expect(bad.reason).toBe("invalid_params");

    const rules = {
      mode: "block-all",
      bash: { allowPatterns: [], blockPatterns: ["sudo *"] },
      write: { allowPatterns: [], blockPatterns: [] },
      edit: { allowPatterns: [], blockPatterns: [] },
    };
    const ok = (await routes.invoke("permission/write", { rules })) as {
      ok: boolean;
      data: { mode: string };
    };
    expect(ok.ok).toBe(true);
    expect(ok.data.mode).toBe("block-all");
    expect(audits.some((line) => line.startsWith("permission_write:block-all"))).toBe(true);
    const onDisk = JSON.parse(readFileSync(join(agentDir, "permission-rules.json"), "utf8")) as {
      mode: string;
    };
    expect(onDisk.mode).toBe("block-all");
  });

  test("permission/read：缺文件降级默认；部分文件宽容呈现（不清档）", async () => {
    const work = mkdtempSync(join(tmpdir(), "pai-sec-perm-"));
    const { routes, agentDir } = makeRoutes(work);
    const empty = (await routes.invoke("permission/read", {})) as {
      ok: boolean;
      data: { mode: string; bash: { blockPatterns: string[] } };
    };
    expect(empty.data.mode).toBe("ask");
    expect(empty.data.bash.blockPatterns).toEqual([]);

    writeFileSync(
      join(agentDir, "permission-rules.json"),
      JSON.stringify({ bash: { blockPatterns: ["sudo *"] } }),
      "utf8",
    );
    const partial = (await routes.invoke("permission/read", {})) as {
      ok: boolean;
      data: { mode: string; bash: { blockPatterns: string[] } };
    };
    expect(partial.data.mode).toBe("ask");
    expect(partial.data.bash.blockPatterns).toEqual(["sudo *"]);
  });

  test("session/start 带 trusted 落审计（host 未启动 → ok:false 但审计先行）", async () => {
    const work = mkdtempSync(join(tmpdir(), "pai-sec-trust-"));
    const { routes, audits } = makeRoutes(work);
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
    const { routes } = makeRoutes(work);
    const agentDir = join(work, "agent");
    mkdirSync(join(agentDir, "sessions"), { recursive: true });
    writeFileSync(join(agentDir, "sessions", "a.jsonl"), "{}", "utf8");

    const forbidden = (await routes.invoke("file/search", { cwd: "/etc", query: "" })) as {
      ok: boolean;
      reason?: string;
    };
    expect(forbidden.ok).toBe(false);
    expect(forbidden.reason).toBe("cwd_forbidden");

    const escape = (await routes.invoke("file/search", {
      cwd: `${agentDir}/../..`,
      query: "",
    })) as { ok: boolean; reason?: string };
    expect(escape.ok).toBe(false);
    expect(escape.reason).toBe("cwd_forbidden");
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
      hubPaths: () => ({ bunPath: "bun", hubEntry: "/nonexistent/cli.js" }),
      logger: { log: () => undefined },
      emit: () => undefined,
    });
    const routes = createApiRoutes({
      runtime,
      settings,
      keyStore,
      audit: () => undefined,
      agentDirFiles: createAgentDirFiles(agentDir),
      agentDefinitions: createAgentDefinitionsStore(agentDir),
      revealPath: (path) => revealed.push(path),
    });
    const outside = (await routes.invoke("session/reveal", { sessionPath: "/etc/passwd" })) as {
      ok: boolean;
      reason?: string;
    };
    expect(outside.ok).toBe(false);
    expect(outside.reason).toBe("session_path_forbidden");
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
    const { routes, audits, agentDir } = makeRoutes(work);
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
    expect(readFileSync(join(agentDir, "agents", "search.md"), "utf8")).toContain("name: 'search'");
    // host 未启动 → 已知项目集合为空 → project 作用域一律拒绝
    const rejected = (await routes.invoke("agent/upsert", {
      definition: { ...definition, scope: "project", project: "/nowhere" },
      previous: null,
    })) as { ok: boolean; reason?: string };
    expect(rejected).toEqual({ ok: false, reason: "invalid_project" });
    const removed = (await routes.invoke("agent/remove", {
      file: "search",
      scope: "user",
      project: null,
    })) as { ok: boolean };
    expect(removed.ok).toBe(true);
    expect(audits).toContain("agent_upsert: user/search");
    expect(audits).toContain("agent_remove: user/search");
  });
});
