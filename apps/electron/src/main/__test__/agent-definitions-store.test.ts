import { beforeAll, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createAgentDefinitionsStore } from '../agent-definitions-store';
import type { AgentDefinition } from '@paiapp/contracts';

/**
 * 定义文件面回归：门禁（name pattern / 项目集合 / 重名）、落位（user 与 project 路径）、
 * 改名与移动（写新删旧）、删除、枚举坏文件跳过、原子写无 .tmp 残留。
 */

function makeDef(overrides: Partial<AgentDefinition> = {}): AgentDefinition {
  return {
    name: 'search',
    description: '联网搜索专员',
    systemPrompt: '你是搜索专员。',
    tools: ['bash'],
    model: null,
    scope: 'user',
    project: null,
    ...overrides,
  };
}

function makeStore(): { store: ReturnType<typeof createAgentDefinitionsStore>; agentDir: string } {
  const work = mkdtempSync(join(tmpdir(), 'pai-agent-store-'));
  const agentDir = join(work, 'agent');
  mkdirSync(agentDir, { recursive: true });
  return { store: createAgentDefinitionsStore(agentDir), agentDir };
}

let PROJECTS: string[] = [];
beforeAll(() => {
  PROJECTS = [mkdtempSync(join(tmpdir(), 'pai-agent-known-'))];
});

describe('agent-definitions-store 门禁', () => {
  test('非法 name（路径逃逸/空/超长）拒绝写；删路径按宽松主干校验（仅分隔符/点开头拒绝）', () => {
    const { store } = makeStore();
    for (const name of ['../evil', 'a/b', '', '.hidden', 'a b', `${'x'.repeat(65)}`]) {
      expect(store.upsert(makeDef({ name }), null, PROJECTS)).toEqual({ ok: false, reason: 'invalid_name' });
    }
    for (const stem of ['../evil', 'a/b', '.hidden', '']) {
      expect(store.remove({ file: stem, scope: 'user', project: null }, PROJECTS)).toEqual({ ok: false, reason: 'invalid_file' });
    }
    // 含空格主干是合法的手写文件名：删除走 not_found（存在性），不是门禁拒绝
    expect(store.remove({ file: 'a b', scope: 'user', project: null }, PROJECTS)).toEqual({ ok: false, reason: 'not_found' });
  });

  test('project 作用域：未知/空项目目录拒绝（写入门禁）', () => {
    const { store } = makeStore();
    expect(store.upsert(makeDef({ scope: 'project', project: '/unknown' }), null, PROJECTS)).toEqual({ ok: false, reason: 'invalid_project' });
    expect(store.upsert(makeDef({ scope: 'project', project: null }), null, PROJECTS)).toEqual({ ok: false, reason: 'invalid_project' });
    expect(store.remove({ file: 'x', scope: 'project', project: '/unknown' }, PROJECTS)).toEqual({ ok: false, reason: 'invalid_project' });
  });

  test('重名：同键位覆盖放行，跨键位目标已存在拒绝', () => {
    const { store } = makeStore();
    const key = { file: 'search', scope: 'user' as const, project: null };
    expect(store.upsert(makeDef(), null, PROJECTS)).toEqual({ ok: true });
    // 同键位再次 upsert（编辑保存）= 覆盖
    expect(store.upsert(makeDef({ description: 'v2' }), key, PROJECTS)).toEqual({ ok: true });
    // user 级与 project 级同名文件独立存在（hub 的运行期覆盖语义，文件面不去重）
    expect(store.upsert(makeDef({ scope: 'project', project: PROJECTS[0] }), null, PROJECTS)).toEqual({ ok: true });
    expect(store.list(PROJECTS)).toHaveLength(2);
  });
});

describe('agent-definitions-store 落位与生命周期', () => {
  test('user 级写入 agentDir/agents/<name>.md 且原子写无 tmp 残留', () => {
    const { store, agentDir } = makeStore();
    expect(store.upsert(makeDef(), null, PROJECTS)).toEqual({ ok: true });
    const file = join(agentDir, 'agents', 'search.md');
    expect(existsSync(file)).toBe(true);
    expect(readdirSync(join(agentDir, 'agents')).filter((name) => name.includes('.tmp'))).toEqual([]);
    const text = readFileSync(file, 'utf8');
    expect(text).toContain("name: 'search'");
    expect(text).toContain('tools:');
    expect(text).toContain('你是搜索专员。');
  });

  test('project 级写入 <项目>/.pi/agents/<name>.md（目录不存在时创建）', () => {
    const work = mkdtempSync(join(tmpdir(), 'pai-agent-store-'));
    const project = join(work, 'proj');
    const store = createAgentDefinitionsStore(join(work, 'agent'));
    expect(store.upsert(makeDef({ scope: 'project', project }), null, [project])).toEqual({ ok: true });
    expect(existsSync(join(project, '.pi', 'agents', 'search.md'))).toBe(true);
  });

  test('改名/移动：写新键位文件并删旧键位文件', () => {
    const { store, agentDir } = makeStore();
    store.upsert(makeDef(), null, PROJECTS);
    const renamed = makeDef({ name: 'searcher', description: '改名' });
    expect(store.upsert(renamed, { file: 'search', scope: 'user', project: null }, PROJECTS)).toEqual({ ok: true });
    expect(existsSync(join(agentDir, 'agents', 'search.md'))).toBe(false);
    expect(existsSync(join(agentDir, 'agents', 'searcher.md'))).toBe(true);
  });

  test('remove 删除文件；不存在返回 not_found', () => {
    const { store, agentDir } = makeStore();
    store.upsert(makeDef(), null, PROJECTS);
    expect(store.remove({ file: 'search', scope: 'user', project: null }, PROJECTS)).toEqual({ ok: true });
    expect(existsSync(join(agentDir, 'agents', 'search.md'))).toBe(false);
    expect(store.remove({ file: 'search', scope: 'user', project: null }, PROJECTS)).toEqual({ ok: false, reason: 'not_found' });
  });

  test('手写文件 name≠主干（审查回归）：编辑保存归一为 name.md + 删旧文件；删除按 file 主干', () => {
    const { store, agentDir } = makeStore();
    mkdirSync(join(agentDir, 'agents'), { recursive: true });
    // 手写 foo.md 内含 name: bar（hub 合法形态；管理身份 = 主干 foo）
    writeFileSync(join(agentDir, 'agents', 'foo.md'), '---\nname: bar\ndescription: 手写\n---\nbody\n');
    const listed = store.list([]);
    expect(listed).toHaveLength(1);
    expect(listed[0]?.name).toBe('bar');
    expect(listed[0]?.file).toBe('foo');
    // 编辑保存（改成合法名 walker）：写 walker.md + 删 foo.md（归一到主干=name 不变式）
    const renamed: AgentDefinition = { name: 'walker', description: '手写改正规', systemPrompt: 'body\n', tools: null, model: null, scope: 'user', project: null };
    expect(store.upsert(renamed, { file: 'foo', scope: 'user', project: null }, [])).toEqual({ ok: true });
    expect(existsSync(join(agentDir, 'agents', 'foo.md'))).toBe(false);
    expect(existsSync(join(agentDir, 'agents', 'walker.md'))).toBe(true);
    // 删除按 file 主干
    expect(store.remove({ file: 'walker', scope: 'user', project: null }, [])).toEqual({ ok: true });
    expect(existsSync(join(agentDir, 'agents', 'walker.md'))).toBe(false);
  });

  test('枚举：user + 已知项目合并；坏文件（缺 name / 坏 frontmatter / 非 md）跳过不拖垮', () => {
    const { store, agentDir } = makeStore();
    const project = mkdtempSync(join(tmpdir(), 'pai-agent-proj-'));
    mkdirSync(join(agentDir, 'agents'), { recursive: true });
    mkdirSync(join(project, '.pi', 'agents'), { recursive: true });
    writeFileSync(join(agentDir, 'agents', 'good.md'), '---\nname: good\ndescription: d\n---\nbody\n');
    writeFileSync(join(agentDir, 'agents', 'no-name.md'), '---\ndescription: d\n---\nbody\n');
    writeFileSync(join(agentDir, 'agents', 'broken.md'), 'not frontmatter\n');
    writeFileSync(join(agentDir, 'agents', 'notes.txt'), 'plain\n');
    writeFileSync(join(project, '.pi', 'agents', 'scoped.md'), '---\nname: scoped\ndescription: p\n---\nbody\n');
    const list = store.list([project]);
    expect(list.map((def) => `${def.scope}:${def.name}`).sort()).toEqual(['project:scoped', 'user:good']);
    // 枚举条目携带 file（文件名主干身份键）
    expect(list.find((def) => def.name === 'good')?.file).toBe('good');
  });
});
