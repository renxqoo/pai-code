import { beforeAll, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createAgentDefinitionsStore } from '../agent-definitions-store';
import { AGENT_DESCRIPTION_MAX, type AgentDefinition } from '@paiapp/contracts';

/**
 * 定义文件面回归：门禁（kebab name 词表 / 保留名 / description ≤500 / 项目集合 / 重名）、
 * 落位（home 的 .my-agent/agents 与项目内 .my-agent/agents）、改名与移动（写新删旧）、
 * 删除、枚举坏文件跳过、原子写无 .tmp 残留。身份键 = frontmatter name。
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

function makeStore(): { store: ReturnType<typeof createAgentDefinitionsStore>; home: string; userDir: string } {
  const work = mkdtempSync(join(tmpdir(), 'pai-agent-store-'));
  const home = join(work, 'home');
  mkdirSync(home, { recursive: true });
  return { store: createAgentDefinitionsStore(home), home, userDir: join(home, '.my-agent', 'agents') };
}

let PROJECTS: string[] = [];
beforeAll(() => {
  PROJECTS = [mkdtempSync(join(tmpdir(), 'pai-agent-known-'))];
});

describe('agent-definitions-store 门禁', () => {
  test('非法 name（路径逃逸/禁字符/空白/大写与下划线与 Unicode/保留名/首尾连字符）拒绝写；kebab 放行', () => {
    const { store } = makeStore();
    for (const name of ['../evil', 'a/b', 'a\\b', '', '.hidden', 'a:b', 'a*b', 'trailing ', ' lead', 'code reviewer', '代码审查员', 'CamelCase', 'UPPER', 'a_b', 'fork', 'main', '-lead', 'trail-']) {
      expect(store.upsert(makeDef({ name }), null, PROJECTS)).toEqual({ ok: false, reason: 'invalid_name' });
    }
    expect(store.upsert(makeDef({ name: 'search' }), null, PROJECTS)).toEqual({ ok: true });
    expect(store.upsert(makeDef({ name: 'code-reviewer' }), null, PROJECTS)).toEqual({ ok: true });
    expect(store.upsert(makeDef({ name: 'v2-fast' }), null, PROJECTS)).toEqual({ ok: true });
    for (const name of ['../evil', 'a/b', '.hidden', '']) {
      expect(store.remove({ name, scope: 'user', project: null }, PROJECTS)).toEqual({ ok: false, reason: 'invalid_name' });
    }
    // 合法名不存在 = 存在性判定，不是门禁拒绝
    expect(store.remove({ name: 'ghost', scope: 'user', project: null }, PROJECTS)).toEqual({ ok: false, reason: 'not_found' });
  });

  test('description 非空单行 ≤500 / systemPrompt 非空（镜像 hub agents/create 校验）', () => {
    const { store } = makeStore();
    expect(store.upsert(makeDef({ description: '' }), null, PROJECTS)).toEqual({ ok: false, reason: 'invalid_description' });
    expect(store.upsert(makeDef({ description: '两行\n描述' }), null, PROJECTS)).toEqual({ ok: false, reason: 'invalid_description' });
    expect(store.upsert(makeDef({ description: 'x'.repeat(AGENT_DESCRIPTION_MAX + 1) }), null, PROJECTS)).toEqual({ ok: false, reason: 'invalid_description' });
    expect(store.upsert(makeDef({ description: 'x'.repeat(AGENT_DESCRIPTION_MAX) }), null, PROJECTS)).toEqual({ ok: true });
    expect(store.upsert(makeDef({ systemPrompt: '  ' }), null, PROJECTS)).toEqual({ ok: false, reason: 'invalid_prompt' });
  });

  test('project 作用域：未知/空项目目录拒绝（写入门禁）', () => {
    const { store } = makeStore();
    expect(store.upsert(makeDef({ scope: 'project', project: '/unknown' }), null, PROJECTS)).toEqual({ ok: false, reason: 'invalid_project' });
    expect(store.upsert(makeDef({ scope: 'project', project: null }), null, PROJECTS)).toEqual({ ok: false, reason: 'invalid_project' });
    expect(store.remove({ name: 'x', scope: 'project', project: '/unknown' }, PROJECTS)).toEqual({ ok: false, reason: 'invalid_project' });
  });

  test('重名：同键位覆盖放行，跨键位目标已存在拒绝', () => {
    const { store } = makeStore();
    const key = { name: 'search', scope: 'user' as const, project: null };
    expect(store.upsert(makeDef(), null, PROJECTS)).toEqual({ ok: true });
    // 同键位再次 upsert（编辑保存）= 覆盖
    expect(store.upsert(makeDef({ description: '更新' }), key, PROJECTS)).toEqual({ ok: true });
    // user 级与 project 级同名文件独立存在（hub 的运行期覆盖语义，文件面不去重）
    expect(store.upsert(makeDef({ scope: 'project', project: PROJECTS[0] ?? '/w' }), null, PROJECTS)).toEqual({ ok: true });
    expect(store.list(PROJECTS)).toHaveLength(2);
  });
});

describe('agent-definitions-store 落位与生命周期', () => {
  test('user 级写入 <home>/.my-agent/agents/<name>.md 且原子写无 tmp 残留', () => {
    const { store, userDir } = makeStore();
    expect(store.upsert(makeDef(), null, PROJECTS)).toEqual({ ok: true });
    const file = join(userDir, 'search.md');
    expect(existsSync(file)).toBe(true);
    expect(readdirSync(userDir).filter((name) => name.includes('.tmp'))).toEqual([]);
    const text = readFileSync(file, 'utf8');
    expect(text).toContain("name: 'search'");
    expect(text).toContain('tools:');
    expect(text).toContain('你是搜索专员。');
  });

  test('project 级写入 <项目>/.my-agent/agents/<name>.md（目录不存在时创建）', () => {
    const work = mkdtempSync(join(tmpdir(), 'pai-agent-store-'));
    const project = join(work, 'proj');
    const store = createAgentDefinitionsStore(join(work, 'home'));
    expect(store.upsert(makeDef({ scope: 'project', project }), null, [project])).toEqual({ ok: true });
    expect(existsSync(join(project, '.my-agent', 'agents', 'search.md'))).toBe(true);
  });

  test('改名/移动：写新键位文件并删旧键位文件（身份键 = name）', () => {
    const { store, userDir } = makeStore();
    store.upsert(makeDef(), null, PROJECTS);
    const renamed = makeDef({ name: 'searcher', description: '改名' });
    expect(store.upsert(renamed, { name: 'search', scope: 'user', project: null }, PROJECTS)).toEqual({ ok: true });
    expect(existsSync(join(userDir, 'search.md'))).toBe(false);
    expect(existsSync(join(userDir, 'searcher.md'))).toBe(true);
  });

  test('remove 删除文件；不存在返回 not_found', () => {
    const { store, userDir } = makeStore();
    store.upsert(makeDef(), null, PROJECTS);
    expect(store.remove({ name: 'search', scope: 'user', project: null }, PROJECTS)).toEqual({ ok: true });
    expect(existsSync(join(userDir, 'search.md'))).toBe(false);
    expect(store.remove({ name: 'search', scope: 'user', project: null }, PROJECTS)).toEqual({ ok: false, reason: 'not_found' });
  });

  test('手写文件 name≠主干（审查回归）：编辑保存归一为 name.md + 删旧文件；删除按 name 定位', () => {
    const { store, userDir } = makeStore();
    mkdirSync(userDir, { recursive: true });
    // 手写 foo.md 内含 name: bar（hub 合法形态；管理身份 = frontmatter name）
    writeFileSync(join(userDir, 'foo.md'), '---\nname: bar\ndescription: 手写\n---\nbody\n');
    const listed = store.list([]);
    expect(listed).toHaveLength(1);
    expect(listed[0]?.name).toBe('bar');
    // 编辑保存（改成合法名 walker）：写 walker.md + 删 foo.md（归一到主干=name 不变式）
    const renamed: AgentDefinition = { name: 'walker', description: '手写改正规', systemPrompt: 'body\n', tools: null, model: null, scope: 'user', project: null };
    expect(store.upsert(renamed, { name: 'bar', scope: 'user', project: null }, [])).toEqual({ ok: true });
    expect(existsSync(join(userDir, 'foo.md'))).toBe(false);
    expect(existsSync(join(userDir, 'walker.md'))).toBe(true);
    // 删除按 name 定位（主干与 name 分歧时按 frontmatter 找到文件）
    expect(store.remove({ name: 'walker', scope: 'user', project: null }, [])).toEqual({ ok: true });
    expect(existsSync(join(userDir, 'walker.md'))).toBe(false);
  });

  test('枚举：user + 已知项目合并；坏文件（缺 name / 坏 frontmatter / 非 md）跳过不拖垮', () => {
    const { store, userDir } = makeStore();
    const project = mkdtempSync(join(tmpdir(), 'pai-agent-proj-'));
    mkdirSync(userDir, { recursive: true });
    mkdirSync(join(project, '.my-agent', 'agents'), { recursive: true });
    writeFileSync(join(userDir, 'good.md'), '---\nname: good\ndescription: d\n---\nbody\n');
    writeFileSync(join(userDir, 'no-name.md'), '---\ndescription: d\n---\nbody\n');
    writeFileSync(join(userDir, 'broken.md'), 'not frontmatter\n');
    writeFileSync(join(userDir, 'notes.txt'), 'plain\n');
    writeFileSync(join(project, '.my-agent', 'agents', 'scoped.md'), '---\nname: scoped\ndescription: p\n---\nbody\n');
    const list = store.list([project]);
    expect(list.map((def) => `${def.scope}:${def.name}`).sort()).toEqual(['project:scoped', 'user:good']);
  });
});
