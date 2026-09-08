import { afterAll, describe, expect, test } from 'bun:test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createApiRoutes } from '../api-routes';
import { createAgentDirFiles } from '../agent-dir-files';
import { createFileSettings, type ProviderKeyStore } from '../file-settings';
import { createPaiRuntime, type PaiRuntime } from '../pai-runtime';

/**
 * 真 pai-cli 集成（opt-in 门禁）：PAI_E2E=1 且提供 GLM_* 环境时走完整 api 路由
 * 旅程（zod 校验 → 命令翻译 → 视图收窄 → 注册表同步）；否则显式跳过
 * （真凭证/花钱场景不进默认门，规约允许 opt-in real 门）。
 */

const e2eEnabled = process.env['PAI_E2E'] === '1';
const glmKey = process.env['GLM_API_KEY'] ?? '';
const glmModel = process.env['GLM_MODEL'] ?? '';
const glmBaseUrl = (process.env['GLM_BASE_URL'] ?? '').replace(/\/chat\/completions$/, '');
const hubEntry = process.env['PAI_HUB_ENTRY'] ?? '/Users/wrr/work/pi/app/dist/cli.js';
const bunPath = process.env['PAI_BUN_PATH'] ?? 'bun';

const runnable = e2eEnabled && glmKey.length > 0 && glmModel.length > 0 && glmBaseUrl.length > 0;

describe('pai-runtime + api-routes × 真 pai-cli（opt-in）', () => {
  let runtime: PaiRuntime | null = null;
  const work = mkdtempSync(join(tmpdir(), 'pai-e2e-runtime-'));
  const eventTypes: string[] = [];

  afterAll(async () => {
    await runtime?.stop();
  });

  test(runnable ? '完整旅程：bootstrap → session/start → prompt → 事件流 → entries → stop' : '完整旅程（跳过：PAI_E2E 未开启或缺凭证）', async () => {
    if (!runnable) {
      expect(runnable).toBe(false);
      return;
    }
    const keyStore: ProviderKeyStore = {
      encryptionAvailable: false,
      getKey: (name) => (name === 'glm' ? glmKey : null),
      setKey: () => undefined,
      keyNames: ['glm'],
    };
    runtime = createPaiRuntime({
      paths: {
        userDataDir: work,
        agentDir: join(work, 'agent'),
        registryDb: join(work, 'registry.sqlite'),
        settingsFile: join(work, 'settings.json'),
        providerKeysFile: join(work, 'keys.json'),
        logFile: join(work, 'main.log'),
      },
      keyStore,
      providers: () => [{ name: 'glm', baseUrl: glmBaseUrl, api: 'openai-completions', models: [glmModel] }],
      hubPaths: () => ({ bunPath, hubEntry }),
      logger: { log: () => undefined },
      emit: (event) => eventTypes.push(event.type),
    });
    const settings = createFileSettings(join(work, 'settings.json'), keyStore);
    const routes = createApiRoutes({ runtime, settings, keyStore, audit: () => undefined, agentDirFiles: createAgentDirFiles(join(work, 'agent')), revealPath: () => undefined });

    await runtime.start();
    expect(runtime.host.phase).toBe('ready');

    const bootstrap = (await routes.invoke('app/bootstrap', {})) as { ok: boolean; data: { models: unknown[] } };
    expect(bootstrap.ok).toBe(true);
    expect((bootstrap.data.models as unknown[]).length).toBeGreaterThan(0);

    const started = (await routes.invoke('session/start', { cwd: work, provider: 'glm', modelId: glmModel })) as {
      ok: boolean;
      data: { threadId: string };
    };
    expect(started.ok).toBe(true);
    const threadId = started.data.threadId;
    expect(runtime.registry.get(threadId)?.cwd).toBe(work);

    const prompted = await routes.invoke('session/prompt', { threadId, message: '只回复两个字：收到' });
    expect(prompted.ok).toBe(true);

    const settled = await waitFor(() => eventTypes.includes('turnSettled'), 60_000);
    expect(settled).toBe(true);
    expect(eventTypes).toContain('turnStarted');
    expect(eventTypes).toContain('messageFinal');

    const entries = (await routes.invoke('session/entries', { threadId })) as { ok: boolean; data: { items: Array<{ kind: string }>; cursor: string | null } };
    expect(entries.ok).toBe(true);
    const kinds = entries.data.items.map((item) => item.kind);
    expect(kinds).toContain('user');
    expect(kinds).toContain('assistant');

    const stats = (await routes.invoke('session/stats', { threadId })) as { ok: boolean; data: { tokensTotal: number } };
    expect(stats.ok).toBe(true);
    expect(stats.data.tokensTotal).toBeGreaterThan(0);

    const stopped = await routes.invoke('session/stop', { threadId });
    expect(stopped.ok).toBe(true);
    expect(runtime.registry.get(threadId)).toBeNull();
  }, 150_000);
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
    }, 100);
  });
}
