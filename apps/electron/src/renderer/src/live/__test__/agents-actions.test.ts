import { describe, expect, test } from 'bun:test';
import type { ApiClient } from '@paiapp/api/client';

import { createAgentsActions } from '../agents-actions';
import type { LiveStore } from '../store';

/** 代理定义动作组（T43 拆分件）：成功刷新目录快照、失败回查表文案（不抛）。 */
function harness(overrides: { upsert?: unknown; remove?: unknown; definitions?: unknown } = {}) {
  const patches: unknown[] = [];
  const api = {
    agents: {
      definitions: () => Promise.resolve(overrides.definitions ?? { ok: true, data: { defs: 1 } }),
      upsert: () => Promise.resolve(overrides.upsert ?? { ok: true, data: {} }),
      remove: () => Promise.resolve(overrides.remove ?? { ok: true, data: {} }),
    },
  } as unknown as ApiClient;
  const store = { setState: (patch: unknown) => patches.push(patch), getState: () => ({}) } as unknown as LiveStore;
  return { actions: createAgentsActions({ api, store }), patches };
}

describe('agents-actions（代理定义动作组）', () => {
  test('refresh：目录拉取成功落 store 快照', async () => {
    const h = harness();
    await h.actions.refreshAgentDefinitions();
    expect(h.patches).toEqual([{ agentDefinitions: { defs: 1 } }]);
  });

  test('upsert/remove 成功：回 null 且刷新目录；失败：回文案串不抛', async () => {
    const okCase = harness();
    expect(await okCase.actions.upsertAgentDefinition({} as never, null)).toBeNull();
    expect(await okCase.actions.removeAgentDefinition({} as never)).toBeNull();
    expect(okCase.patches.length).toBe(2); // 每次 upsert/remove 各带一次目录刷新

    const fail = { ok: false, error: { kind: 'io_failed', message: 'x' } };
    const failCase = harness({ upsert: fail, remove: fail });
    expect(typeof (await failCase.actions.upsertAgentDefinition({} as never, null))).toBe('string');
    expect(typeof (await failCase.actions.removeAgentDefinition({} as never))).toBe('string');
  });
});
