import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { HubFrame, HostPhase, HostProcessPort, PaiCommand, HostCommandOutcome } from "@paiapp/contracts";

import { createApiRoutes } from "../api-routes";
import { createAgentDirFiles } from "../agent-dir-files";
import { createAgentDefinitionsStore } from "../agent-definitions-store";
import { createFileSettings, type ProviderKeyStore } from "../file-settings";
import { createPaiRuntime } from "../pai-runtime";

/**
 * session/fork 路由回归（fork 换轨语义）：
 * - 协议 cancelled 形状（扩展拦截）不当新会话登记，不覆盖原会话行；
 * - previousThreadId 对不上请求 = 坏形状拒绝（防 ABA）；
 * - 成功后旧 threadId 转 parked（hub 已移除该 id，文件保留可懒恢复），
 *   新会话 cwd/标题从被分叉会话继承（响应不带这两个字段）。
 */

const keyStore: ProviderKeyStore = {
  encryptionAvailable: false,
  getKey: () => null,
  setKey: () => undefined,
  keyNames: [],
};

type ForkResponse = Record<string, unknown>;

/** 可编程 fake host：按命令类型回放预置响应。 */
function fakeHost(responses: { fork?: ForkResponse | { error: string }; state?: Record<string, unknown> }): HostProcessPort {
  return {
    request: (command: PaiCommand): Promise<HostCommandOutcome> => {
      if (command.type === 'fork') {
        const fork = responses.fork;
        if (fork === undefined) return Promise.resolve({ ok: false, error: 'fork failed' });
        if ('error' in fork) return Promise.resolve({ ok: false, error: fork.error });
        return Promise.resolve({ ok: true, data: fork });
      }
      if (command.type === 'get_state') {
        return Promise.resolve({
          ok: true,
          data: responses.state ?? { model: { provider: 'GLM', modelId: 'glm-5.3' }, thinkingLevel: 'medium' },
        });
      }
      return Promise.resolve({ ok: true, data: {} });
    },
    onFrame: () => () => undefined,
    onPhase: () => () => undefined,
    restart: () => Promise.resolve(),
    dispose: () => Promise.resolve(),
    get phase(): HostPhase {
      return 'ready';
    },
    diagnostics: () => ({ stderrTail: '' }),
  } satisfies HostProcessPort;
}

function frameSink(): { frames: HubFrame[]; emit: (frame: HubFrame) => void } {
  const frames: HubFrame[] = [];
  return { frames, emit: (frame) => frames.push(frame) };
}

async function makeRoutes(responses: Parameters<typeof fakeHost>[0]) {
  const work = mkdtempSync(join(tmpdir(), "pai-fork-route-"));
  const agentDir = join(work, "agent");
  mkdirSync(join(agentDir, "sessions"), { recursive: true });
  // hubEntry 只需真实存在（start 的 existsSync 门）；host 本体由 fake 注入
  const hubEntry = join(work, "cli.js");
  writeFileSync(hubEntry, "");
  const sink = frameSink();
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
    hubPaths: () => ({ bunPath: "bun", hubEntry }),
    logger: { log: () => undefined },
    emit: sink.emit,
    createHost: () => fakeHost(responses),
  });
  // runtime.host 触发构建（start 会等待 ready；fake host 已是 ready 相位）
  await runtime.start();
  runtime.markBootstrapped();
  runtime.emitBuffered();
  // 预置被分叉会话（cwd/标题为继承断言基准）
  runtime.applyStartOutcome("t-old", "/w/proj", join(agentDir, "sessions", "old.jsonl"), "原标题", 1000);
  const routes = createApiRoutes({
    runtime,
    settings: createFileSettings(join(work, "settings.json"), keyStore),
    keyStore,
    audit: () => undefined,
    agentDirFiles: createAgentDirFiles(agentDir),
    agentDefinitions: createAgentDefinitionsStore(agentDir),
    revealPath: () => undefined,
    pickDirectory: () => Promise.resolve(null),
  });
  return { routes, runtime, sink, agentDir };
}

const forkParams = { threadId: "t-old", entryId: "e1", position: "before" } as const;

describe("session/fork 路由（fork 换轨语义）", () => {
  test("cancelled（扩展拦截）：拒绝且原会话行不被覆盖", async () => {
    const { routes, runtime } = await makeRoutes({
      fork: { threadId: "t-old", previousThreadId: "t-old", sessionPath: null, text: null, cancelled: true },
    });
    const outcome = (await routes.invoke("session/fork", forkParams)) as { ok: boolean; reason?: string };
    expect(outcome).toEqual({ ok: false, reason: "fork_cancelled" });
    const old = runtime.sessions().find((session) => session.threadId === "t-old");
    expect(old?.cwd).toBe("/w/proj");
    expect(old?.title).toBe("原标题");
    expect(old?.state).toBe("live");
  });

  test("previousThreadId 对不上请求：坏形状拒绝", async () => {
    const { routes } = await makeRoutes({
      fork: { threadId: "t-new", previousThreadId: "t-someone-else", sessionPath: "/a.jsonl", text: null, cancelled: false },
    });
    const outcome = (await routes.invoke("session/fork", forkParams)) as { ok: boolean; reason?: string };
    expect(outcome).toEqual({ ok: false, reason: "malformed_response" });
  });

  test("成功：旧行转 parked 且清 streaming，新会话继承 cwd/标题", async () => {
    const sessionPath = "/later/forked.jsonl";
    const { routes, runtime, sink } = await makeRoutes({
      fork: { threadId: "t-new", previousThreadId: "t-old", sessionPath, text: "原文", cancelled: false },
    });
    runtime.touchSession("t-old", { streaming: true });
    const outcome = (await routes.invoke("session/fork", forkParams)) as
      | { ok: true; data: { threadId: string; cwd: string; title: string; state: string; sessionPath: string | null } }
      | { ok: false; reason: string };
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.data.threadId).toBe("t-new");
    expect(outcome.data.cwd).toBe("/w/proj");
    expect(outcome.data.title).toBe("原标题");
    expect(outcome.data.state).toBe("live");

    const old = runtime.sessions().find((session) => session.threadId === "t-old");
    expect(old?.state).toBe("parked");
    expect(old?.streaming).toBe(false);
    // parked 化经 sessionUpdated 广播（渲染层 sessions 同步）
    expect(sink.frames).toContainEqual({ type: "sessionUpdated", session: old });
    // 注册表新行落库（重启恢复依据）
    const row = runtime.registry.get("t-new");
    expect(row?.cwd).toBe("/w/proj");
    expect(row?.sessionPath).toBe(sessionPath);
  });
});
