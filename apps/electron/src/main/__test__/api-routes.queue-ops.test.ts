import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { HostPhase, HostProcessPort, PaiCommand, HostCommandOutcome } from "@paiapp/contracts";

import { createApiRoutes } from "../api-routes";
import { createAgentDefinitionsStore } from "../agent-definitions-store";
import { createFileSettings, type ProviderKeyStore } from "../file-settings";
import { createPaiRuntime } from "../pai-runtime";
import { createRuntimeMonitor } from '@paiapp/infra';

/**
 * 单条队列路由回归（session/queueDrop、session/queueSendNow）：
 * - 入参经 zod strict（entryId 非空）；
 * - hub 成功 → {ok:true, data:null}（ack 档）；
 * - hub state_conflict / streaming_window 拒绝 → error 原样透传（消费方按码出文案）。
 */

const keyStore: ProviderKeyStore = {
  encryptionAvailable: false,
  getKey: () => null,
  setKey: () => undefined,
  keyNames: [],
};

function fakeHost(responses: Record<string, unknown>): { port: HostProcessPort; sent: PaiCommand[] } {
  const sent: PaiCommand[] = [];
  const port: HostProcessPort = {
    request: (command: PaiCommand): Promise<HostCommandOutcome> => {
      sent.push(command);
      if (command.type === 'queue/drop' || command.type === 'queue/send_now') {
        const preset = responses[command.type];
        if (preset !== undefined) return Promise.resolve(preset as HostCommandOutcome);
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
    diagnostics: () => ({ stderrTail: '', restartCount: 0, lastRestartCause: null, lastRestartAt: null }),
  };
  return { port, sent };
}

async function makeRoutes(responses: Record<string, unknown>) {
  const work = mkdtempSync(join(tmpdir(), "pai-queue-route-"));
  const agentDir = join(work, "agent");
  mkdirSync(join(agentDir, "sessions"), { recursive: true });
  const hubEntry = join(work, "cli.js");
  writeFileSync(hubEntry, "");
  const host = fakeHost(responses);
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
    hubPaths: () => ({ bunPath: "bun", hubEntry }),
    logger: { log: () => undefined },
    emit: () => undefined,
    createHost: () => host.port,
  });
  await runtime.start();
  runtime.markBootstrapped();
  runtime.emitBuffered();
  const routes = createApiRoutes({
    runtime,
    settings: createFileSettings(join(work, "settings.json"), keyStore),
    keyStore,
    audit: () => undefined,
    agentDefinitions: createAgentDefinitionsStore(join(work, "home")),
    agentDir,
    revealPath: () => undefined,
    pickDirectory: () => Promise.resolve(null),
    exportDiagnosticsBundle: () => work,
    monitor: createRuntimeMonitor({ host: () => null, hub: () => null, appMetrics: () => ({ rssBytes: null, cpuPercent: null }), systemMemory: () => ({ totalBytes: null, availableBytes: null }), idleRecycleMinutes: () => 5, appVersion: () => 'test' }),
  });
  return { routes, sent: host.sent };
}

describe("session/queueDrop 路由", () => {
  test("成功：entryId 原样进 queue/drop 命令，响应 ack null", async () => {
    const { routes, sent } = await makeRoutes({});
    const outcome = (await routes.invoke("session/queueDrop", { threadId: "t1", entryId: "msg_1" })) as { ok: boolean; data: unknown };
    expect(outcome).toEqual({ ok: true, data: null });
    expect(sent.find((command) => command.type === "queue/drop")).toMatchObject({ type: "queue/drop", threadId: "t1", entryId: "msg_1" });
  });

  test("hub state_conflict（已消费）：error 原样透传", async () => {
    const { routes } = await makeRoutes({
      "queue/drop": { ok: false, error: { code: "state_conflict", message: "queue entry not found: msg_1" } },
    });
    const outcome = (await routes.invoke("session/queueDrop", { threadId: "t1", entryId: "msg_1" })) as { ok: boolean; error?: { kind: string } };
    expect(outcome.ok).toBe(false);
    expect(outcome.error?.kind).toBe("state_conflict");
  });

  test("空 entryId：strict schema 拒绝（invalid_params）", async () => {
    const { routes } = await makeRoutes({});
    const outcome = (await routes.invoke("session/queueDrop", { threadId: "t1", entryId: "" })) as { ok: boolean; error?: { kind: string } };
    expect(outcome.ok).toBe(false);
    expect(outcome.error?.kind).toBe("invalid_params");
  });
});

describe("session/queueSendNow 路由", () => {
  test("成功：entryId 原样进 queue/send_now 命令，响应 ack null", async () => {
    const { routes, sent } = await makeRoutes({});
    const outcome = (await routes.invoke("session/queueSendNow", { threadId: "t1", entryId: "msg_2" })) as { ok: boolean; data: unknown };
    expect(outcome).toEqual({ ok: true, data: null });
    expect(sent.find((command) => command.type === "queue/send_now")).toMatchObject({ type: "queue/send_now", threadId: "t1", entryId: "msg_2" });
  });

  test("hub streaming_window（无运行中轮）：error 原样透传", async () => {
    const { routes } = await makeRoutes({
      "queue/send_now": { ok: false, error: { code: "streaming_window", message: "no running turn to steer into" } },
    });
    const outcome = (await routes.invoke("session/queueSendNow", { threadId: "t1", entryId: "msg_2" })) as { ok: boolean; error?: { kind: string } };
    expect(outcome.ok).toBe(false);
    expect(outcome.error?.kind).toBe("streaming_window");
  });
});
