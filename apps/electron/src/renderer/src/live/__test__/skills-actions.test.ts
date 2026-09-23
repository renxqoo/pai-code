import { describe, expect, test } from 'bun:test';
import type { ApiClient } from '@paiapp/api/client';

import { createSkillsActions } from '../skills-actions';
import type { SkillsActions } from '../skills-actions';
import type { LiveStore } from '../store';

/** 技能动作组（T43 拆分件——T42 起无单测，本批补齐）：清单/启停/候选/批量导入
 *  （逐条隔离 + 导入即启用 + 批末单次重开）/移除。 */
interface SkillsStubState {
  list: unknown;
  setEnabled: unknown;
  candidates: unknown;
  imports: Record<string, unknown>;
  removes: unknown;
}

function harness(stub: SkillsStubState, sessions: Array<{ threadId: string; state: string }> = []) {
  const patches: unknown[] = [];
  const calls: string[] = [];
  const api = {
    skills: {
      list: () => Promise.resolve(stub.list),
      setEnabled: (input: { name: string }) => {
        calls.push(`setEnabled:${input.name}`);
        return Promise.resolve(stub.setEnabled);
      },
      candidates: () => Promise.resolve(stub.candidates),
      import: (input: { sourcePath: string }) => {
        calls.push(`import:${input.sourcePath}`);
        return Promise.resolve(stub.imports[input.sourcePath] ?? { ok: true, data: null });
      },
      remove: () => Promise.resolve(stub.removes),
    },
  } as unknown as ApiClient;
  const store = {
    setState: (patch: unknown) => patches.push(patch),
    getState: () => ({ sessions }),
  } as unknown as LiveStore;
  const actions: SkillsActions = createSkillsActions({
    api,
    store,
    chainSkills: (run) => run(),
    reopenSession: (threadId) => {
      calls.push(`reopen:${threadId}`);
      return Promise.resolve(threadId !== 'dead-live');
    },
  });
  return { actions, patches, calls };
}

const SKILLS = [{ name: 'a', enabled: true, source: 'user' }];

describe('skills-actions（技能动作组）', () => {
  test('refreshSkills：清单落 store；失败不动 store', async () => {
    const okCase = harness({ list: { ok: true, data: SKILLS } });
    await okCase.actions.refreshSkills();
    expect(okCase.patches).toEqual([{ skills: SKILLS }]);
    const failCase = harness({ list: { ok: false, error: { kind: 'io_failed', message: 'x' } } });
    await failCase.actions.refreshSkills();
    expect(failCase.patches).toEqual([]);
  });

  test('setSkillEnabled：成功回数据 + 落 store；失败回文案串', async () => {
    const okCase = harness({ list: { ok: true, data: SKILLS }, setEnabled: { ok: true, data: SKILLS } });
    expect(await okCase.actions.setSkillEnabled('a', false)).toEqual({ ok: true, data: SKILLS });
    const failCase = harness({ setEnabled: { ok: false, error: { kind: 'io_failed', message: 'x' } } });
    const failed = await failCase.actions.setSkillEnabled('a', false);
    expect(failed.ok).toBe(false);
    if (!failed.ok) expect(typeof failed.reason).toBe('string');
  });

  test('applySkillToggle：启停后重开活跃会话（parked 不重开）；失败计数', async () => {
    const h = harness({ setEnabled: { ok: true, data: SKILLS } }, [
      { threadId: 'live-1', state: 'live' },
      { threadId: 'parked-1', state: 'parked' },
      { threadId: 'dead-live', state: 'live' },
    ]);
    const outcome = await h.actions.applySkillToggle('a', true);
    expect(outcome).toEqual({ ok: true, reopenFailures: 1 }); // dead-live 重开失败
    expect(h.calls).toContain('reopen:live-1');
    expect(h.calls).not.toContain('reopen:parked-1');
  });

  test('scanSkillCandidates：成功回候选；失败回文案串', async () => {
    const okCase = harness({ candidates: { ok: true, data: { candidates: [{ sourcePath: '/s/a' }] } } });
    expect(await okCase.actions.scanSkillCandidates()).toEqual({ ok: true, candidates: [{ sourcePath: '/s/a' }] });
    const failCase = harness({ candidates: { ok: false, error: { kind: 'io_failed', message: 'x' } } });
    const failed = await failCase.actions.scanSkillCandidates('/s');
    expect(failed.ok).toBe(false);
  });

  test('importSkills：逐条隔离 + 导入即启用（名单清除）+ 批末单次重开', async () => {
    const skills = [
      { name: 'imported-enabled', enabled: true, source: 'user' },
      { name: 'imported-disabled', enabled: false, source: 'user' },
    ];
    const h = harness(
      {
        list: { ok: true, data: [] },
        // 名单内禁用 → 触发补启用；名单外已启用 → 不触发
        setEnabled: { ok: true, data: skills },
        imports: {
          '/s/ok1': { ok: true, data: { imported: { name: 'imported-enabled', path: '/x' }, skills } },
          '/s/ok2': { ok: true, data: { imported: { name: 'imported-disabled', path: '/y' }, skills } },
          '/s/bad': { ok: false, error: { kind: 'skill_invalid', message: 'shape' } },
        },
      },
      [{ threadId: 'live-1', state: 'live' }],
    );
    const summary = await h.actions.importSkills([
      { sourcePath: '/s/ok1' },
      { sourcePath: '/s/ok2' },
      { sourcePath: '/s/bad' },
    ]);
    expect(summary.imported).toBe(2);
    expect(summary.failed.length).toBe(1);
    expect(summary.failed[0]?.name).toBe('bad');
    expect(h.calls).toContain('setEnabled:imported-disabled'); // 导入即启用
    expect(h.calls).not.toContain('setEnabled:imported-enabled');
    expect(h.calls.filter((c) => c.startsWith('reopen:')).length).toBe(1); // 批末单次
  });

  test('importSkills 全失败：不触发重开', async () => {
    const h = harness({ imports: { '/s/bad': { ok: false, error: { kind: 'skill_invalid', message: 'x' } } } }, [
      { threadId: 'live-1', state: 'live' },
    ]);
    const summary = await h.actions.importSkills([{ sourcePath: '/s/bad' }]);
    expect(summary.imported).toBe(0);
    expect(h.calls.filter((c) => c.startsWith('reopen:')).length).toBe(0);
  });

  test('removeSkill：成功落 store + 重开；失败回文案串', async () => {
    const okCase = harness({ removes: { ok: true, data: [] } }, [{ threadId: 'live-1', state: 'live' }]);
    expect(await okCase.actions.removeSkill('a')).toEqual({ ok: true, reopenFailures: 0 });
    expect(okCase.calls).toContain('reopen:live-1');
    const failCase = harness({ removes: { ok: false, error: { kind: 'io_failed', message: 'x' } } });
    const failed = await failCase.actions.removeSkill('a');
    expect(failed.ok).toBe(false);
  });
});
