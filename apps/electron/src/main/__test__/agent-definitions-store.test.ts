import { beforeAll, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createAgentDefinitionsStore } from '../agent-definitions-store';
import type { AgentDefinition } from '@paiapp/contracts';

/**
 * 定义文件面回归（x-harness 规则）：门禁（name 非空无 `/` 无换行——无 kebab/保留名；
 * description 非空单行非字段形态行——无长度上限；项目集合；重名）、落位（home 的
 * .x-harness/agents 与项目内 .x-harness/agents）、改名与移动（写新删旧）、删除、
 * 枚举坏文件跳过、原子写无 .tmp 残留。身份键 = frontmatter name。
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
  const agentDir = join(work, 'agent');
  mkdirSync(home, { recursive: true });
  return { store: createAgentDefinitionsStore({ homeDir: home, agentDir }), home, agentDir, userDir: join(agentDir, 'agents') };
}

let PROJECTS: string[] = [];
beforeAll(() => {
  PROJECTS = [mkdtempSync(join(tmpdir(), 'pai-agent-known-'))];
});

describe('agent-definitions-store 门禁', () => {
  test('非法 name（空/含路径分隔符/换行/文件名主干不可用）拒绝写；宽松词形（空格/大小写/下划线/中文/历史保留名）放行', () => {
    const { store } = makeStore();
    for (const name of ['../evil', 'a/b', '', 'a\nb', '.hidden', 'a\\b']) {
      expect(store.upsert(makeDef({ name }), null, PROJECTS)).toEqual({ ok: false, reason: 'invalid_name' });
    }
    // x-harness 规则放宽：kebab/保留名/长度上限退役——这些形态全部合法
    for (const name of ['search', 'code-reviewer', 'v2-fast', 'code reviewer', 'CamelCase', 'a_b', 'fork', 'main', '代码审查员']) {
      expect(store.upsert(makeDef({ name }), null, PROJECTS)).toEqual({ ok: true });
    }
    for (const name of ['../evil', 'a/b', '.hidden', '']) {
      expect(store.remove({ name, scope: 'user', project: null }, PROJECTS)).toEqual({ ok: false, reason: 'invalid_name' });
    }
    // 合法名不存在 = 存在性判定，不是门禁拒绝
    expect(store.remove({ name: 'ghost', scope: 'user', project: null }, PROJECTS)).toEqual({ ok: false, reason: 'not_found' });
  });

  test('description 非空单行且非字段形态行 / systemPrompt 非空（镜像 x-harness agents-admin 校验；无长度上限）', () => {
    const { store } = makeStore();
    expect(store.upsert(makeDef({ description: '' }), null, PROJECTS)).toEqual({ ok: false, reason: 'invalid_description' });
    expect(store.upsert(makeDef({ description: '两行\n描述' }), null, PROJECTS)).toEqual({ ok: false, reason: 'invalid_description' });
    // frontmatter 注入防线：字段形态行拒绝
    expect(store.upsert(makeDef({ description: 'model: injected' }), null, PROJECTS)).toEqual({ ok: false, reason: 'invalid_description' });
    expect(store.upsert(makeDef({ description: 'x'.repeat(600) }), null, PROJECTS)).toEqual({ ok: true });
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
  test('user 级写入 <home>/.x-harness/agents/<name>.md 且原子写无 tmp 残留', () => {
    const { store, userDir } = makeStore();
    expect(store.upsert(makeDef(), null, PROJECTS)).toEqual({ ok: true });
    const file = join(userDir, 'search.md');
    expect(existsSync(file)).toBe(true);
    expect(readdirSync(userDir).filter((name) => name.includes('.tmp'))).toEqual([]);
    const text = readFileSync(file, 'utf8');
    // x-harness renderAgentType 同构：name 入档、无引号标量、tools 逗号串
    expect(text).toContain('name: search');
    expect(text).toContain('description: 联网搜索专员');
    expect(text).toContain('tools: bash');
    expect(text).toContain('你是搜索专员。');
  });

  test('复合串 model 拆开写 model+provider 两行（串线修复）；round-trip 枚举合并回复合串', () => {
    const { store, userDir } = makeStore();
    expect(store.upsert(makeDef({ name: 'cross', model: 'deepseek/deepseek-flash' }), null, PROJECTS)).toEqual({ ok: true });
    const text = readFileSync(join(userDir, 'cross.md'), 'utf8');
    expect(text).toContain('model: deepseek-flash');
    expect(text).toContain('provider: deepseek');
    expect(text).not.toContain('model: deepseek/deepseek-flash');
    // 枚举读回：UI 形态恒复合串
    const listed = store.list(PROJECTS).find((def) => def.name === 'cross');
    expect(listed?.model).toBe('deepseek/deepseek-flash');
  });

  test('project 级写入 <项目>/.x-harness/agents/<name>.md（目录不存在时创建）', () => {
    const work = mkdtempSync(join(tmpdir(), 'pai-agent-store-'));
    const project = join(work, 'proj');
    const store = createAgentDefinitionsStore({ homeDir: join(work, 'home'), agentDir: join(work, 'agent') });
    expect(store.upsert(makeDef({ scope: 'project', project }), null, [project])).toEqual({ ok: true });
    expect(existsSync(join(project, '.x-harness', 'agents', 'search.md'))).toBe(true);
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

  test('枚举：user + 已知项目合并；无 name 字段按主干回落（hub 语义）；坏文件跳过不拖垮', () => {
    const { store, userDir } = makeStore();
    const project = mkdtempSync(join(tmpdir(), 'pai-agent-proj-'));
    mkdirSync(userDir, { recursive: true });
    mkdirSync(join(project, '.x-harness', 'agents'), { recursive: true });
    writeFileSync(join(userDir, 'good.md'), '---\nname: good\ndescription: d\n---\nbody\n');
    // name 缺省 = 文件主干（host-hub 语义）——不再是坏文件
    writeFileSync(join(userDir, 'no-name.md'), '---\ndescription: d\n---\nbody\n');
    writeFileSync(join(userDir, 'broken.md'), 'not frontmatter\n');
    writeFileSync(join(userDir, 'notes.txt'), 'plain\n');
    writeFileSync(join(project, '.x-harness', 'agents', 'scoped.md'), '---\nname: scoped\ndescription: p\n---\nbody\n');
    const list = store.list([project]);
    expect(list.map((def) => `${def.scope}:${def.name}`).sort()).toEqual(['project:scoped', 'user:good', 'user:no-name']);
  });
});
