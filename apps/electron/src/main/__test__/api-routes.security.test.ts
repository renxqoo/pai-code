import { describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createApiRoutes } from '../api-routes';
import { createFileSettings, type ProviderKeyStore } from '../file-settings';
import { createPaiRuntime } from '../pai-runtime';

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
  const agentDir = join(work, 'agent');
  mkdirSync(join(agentDir, 'sessions'), { recursive: true });
  const settings = createFileSettings(join(work, 'settings.json'), keyStore);
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
    hubPaths: () => ({ bunPath: 'bun', hubEntry: '/nonexistent/cli.js' }),
    logger: { log: () => undefined },
    emit: () => undefined,
  });
  const audits: string[] = [];
  const routes = createApiRoutes({ runtime, settings, keyStore, audit: (m) => audits.push(m) });
  return { routes, audits, agentDir };
}

describe('api-routes 安全面（C-S2/C-S8/C-S4）', () => {
  test('C-S2：session/resume 白名单——目录外/穿越拒绝，目录内放行（macOS 符号链接归一）', async () => {
    const work = mkdtempSync(join(tmpdir(), 'pai-sec-route-'));
    const { routes, agentDir } = makeRoutes(work);
    const outside = join(work, 'outside');
    mkdirSync(outside, { recursive: true });
    writeFileSync(join(outside, 'evil.jsonl'), '{}\n');

    const evil = (await routes.invoke('session/resume', { sessionPath: join(outside, 'evil.jsonl') })) as { ok: boolean; reason?: string };
    expect(evil).toEqual({ ok: false, reason: 'session_path_forbidden' });

    const traversal = (await routes.invoke('session/resume', {
      sessionPath: `${agentDir}/sessions/../../outside/evil.jsonl`,
    })) as { ok: boolean; reason?: string };
    expect(traversal).toEqual({ ok: false, reason: 'session_path_forbidden' });

    // 白名单内：到达 host（此处 host 不可用 → host_unavailable，证明未被白名单拦截）
    const inside = (await routes.invoke('session/resume', { sessionPath: join(agentDir, 'sessions', 'ok.jsonl') })) as {
      ok: boolean;
      reason?: string;
    };
    expect(inside).toEqual({ ok: false, reason: 'host_unavailable' });
  });

  test('C-S8：provider 名 sanitize 碰撞拒绝（a-b 与 a_b 同映射 PAI_KEY_A_B）', async () => {
    const work = mkdtempSync(join(tmpdir(), 'pai-sec-collide-'));
    const { routes } = makeRoutes(work);
    const first = (await routes.invoke('provider/upsert', {
      name: 'a-b',
      baseUrl: 'https://a.example.com',
      api: 'openai-completions',
      models: ['m'],
    })) as { ok: boolean };
    expect(first.ok).toBe(true);
    const collide = (await routes.invoke('provider/upsert', {
      name: 'a_b',
      baseUrl: 'https://b.example.com',
      api: 'openai-completions',
      models: ['m'],
    })) as { ok: boolean; reason?: string };
    expect(collide).toEqual({ ok: false, reason: 'provider_name_conflict' });
    // 同名更新自身合法
    const self = (await routes.invoke('provider/upsert', {
      name: 'a-b',
      baseUrl: 'https://a2.example.com',
      api: 'openai-completions',
      models: ['m2'],
    })) as { ok: boolean };
    expect(self.ok).toBe(true);
  });

  test('C-S4：host 未启动时 provider/upsert / app/bootstrap 全走 outcome 不 reject；配置落盘', async () => {
    const work = mkdtempSync(join(tmpdir(), 'pai-sec-contract-'));
    const { routes } = makeRoutes(work);
    await expect(
      routes.invoke('provider/upsert', { name: 'glm', baseUrl: 'https://x.example.com', api: 'openai-completions', models: ['m'] }),
    ).resolves.toMatchObject({ ok: true });
    const bootstrap = (await routes.invoke('app/bootstrap', {})) as { ok: boolean; data: unknown };
    expect(bootstrap.ok).toBe(true);
    await expect(routes.invoke('provider/remove', { name: 'glm' })).resolves.toMatchObject({ ok: true });
  });

  test('S6：dialog/respond 权限应答落审计日志', async () => {
    const work = mkdtempSync(join(tmpdir(), 'pai-sec-audit-'));
    const { routes, audits } = makeRoutes(work);
    await routes.invoke('dialog/respond', { requestId: 'r1', payload: { confirmed: true } });
    await routes.invoke('dialog/respond', { requestId: 'r2', payload: { cancelled: true } });
    expect(audits).toContain('dialog_respond:r1:confirmed');
    expect(audits).toContain('dialog_respond:r2:cancelled');
  });
});
