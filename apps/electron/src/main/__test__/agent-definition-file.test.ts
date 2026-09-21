import { describe, expect, test } from 'bun:test';

import { agentDefinitionPath, parseAgentDefinition, serializeAgentDefinition } from '../agent-definition-file';

/**
 * 定义文件编解码回归：写侧 = host-hub renderAgentTypeMd 同构（无 name 字段——
 * name ≡ 文件主干、无引号标量、tools 流数组）；读侧宽容（引号/逗号串/尾注释）。
 * 序列化往返经 stem 回落取回 name。
 */
describe('agent 定义 md 编解码', () => {
  test('序列化 → 解析往返（hub 规范形态：无 name 字段 + 无引号标量 + tools 流数组）', () => {
    const text = serializeAgentDefinition({
      name: 'search',
      description: '联网搜索专员',
      systemPrompt: '你是搜索专员。\n\n## 工具\n\n只有 bash。',
      tools: ['read', 'bash'],
      model: 'glm-4.7',
    });
    // 写侧产物与 x-harness renderAgentType 逐行同构（name 入档 + tools 逗号分隔）
    expect(text).toBe(['---', 'name: search', 'description: 联网搜索专员', 'model: glm-4.7', 'tools: read,bash', '---', '', '你是搜索专员。', '', '## 工具', '', '只有 bash。', ''].join('\n'));
    // name 缺省 → stem 回落（hub 语义）
    const parsed = parseAgentDefinition(text, 'search');
    expect(parsed).toEqual({
      name: 'search',
      description: '联网搜索专员',
      systemPrompt: '你是搜索专员。\n\n## 工具\n\n只有 bash。\n',
      tools: ['read', 'bash'],
      model: 'glm-4.7',
    });
  });

  test('tools/model 为 null 时字段整体不写（= hub 运行期继承语义）', () => {
    const text = serializeAgentDefinition({ name: 'a', description: 'd', systemPrompt: 'p', tools: null, model: null });
    expect(text).not.toContain('tools');
    expect(text).not.toContain('model');
    expect(parseAgentDefinition(text, 'a')?.tools).toBeNull();
    expect(parseAgentDefinition(text, 'a')?.model).toBeNull();
  });

  test('解析逗号串 tools（hub 历史形态）与双引号标量', () => {
    const text = ['---', 'name: legacy', 'description: "旧格式"', 'tools: read, bash , grep', 'model: m1', '---', '', 'body', ''].join('\n');
    expect(parseAgentDefinition(text)).toEqual({
      name: 'legacy',
      description: '旧格式',
      systemPrompt: 'body\n',
      tools: ['read', 'bash', 'grep'],
      model: 'm1',
    });
  });

  test('坏输入降级：无 frontmatter / 坏 YAML 边界 / 缺 name / 缺 description / 非法 name → null', () => {
    expect(parseAgentDefinition('no frontmatter')).toBeNull();
    expect(parseAgentDefinition('---\n---\nbody')).toBeNull();
    expect(parseAgentDefinition('---\ndescription: d\n---\nbody')).toBeNull();
    expect(parseAgentDefinition('---\nname: n\n---\nbody')).toBeNull();
    // parse 放宽：name 可为任意非空字符串（含路径形态）——pattern 门禁只在写路径
    expect(parseAgentDefinition('---\nname: ../evil\ndescription: d\n---\nbody')?.name).toBe('../evil');
  });

  test('description 单行契约：多行描述由 store 写前校验拒绝（序列化不做折叠——hub renderAgentTypeMd 同为原样单行）', () => {
    const text = serializeAgentDefinition({ name: 'a', description: '第一行\n第二行', systemPrompt: '', tools: null, model: null });
    // 多行 description 破坏 frontmatter——这是调用方契约违约，store 层校验先行拒绝
    expect(text.split('\n')[2]).toBe('description: 第一行');
  });

  test('hub 全形态（审查回归）：flow 数组 / 空数组 / 标量尾注释 / BOM / 栅栏尾空格 / 任意 name', () => {
    const flow = ['---', 'name: flow-agents', 'description: my agent # note', 'tools: [read, bash]', 'model: glm # x', '---', 'body', ''].join('\n');
    expect(parseAgentDefinition(flow)).toEqual({ name: 'flow-agents', description: 'my agent', systemPrompt: 'body\n', tools: ['read', 'bash'], model: 'glm' });
    const empty = ['---', 'name: empty-tools', 'description: d', 'tools: []', '---', '', ''].join('\n');
    expect(parseAgentDefinition(empty)?.tools).toBeNull();
    // 引号内的 # 是内容，不剥
    const quoted = ['---', 'name: hash', 'description: "a # b"', '---', '', ''].join('\n');
    expect(parseAgentDefinition(quoted)?.description).toBe('a # b');
    // BOM 与栅栏尾空格
    const bom = '---\nname: bom\ndescription: d\n---  \nbody\n';
    expect(parseAgentDefinition(`\uFEFF${bom}`)).toEqual({ name: 'bom', description: 'd', systemPrompt: 'body\n', tools: null, model: null });
    // hub 允许任意字符串 name（pattern 校验只在写路径）
    const cjk = ['---', 'name: 搜索', 'description: 中文定义', '---', '正文', ''].join('\n');
    expect(parseAgentDefinition(cjk)?.name).toBe('搜索');
  });

  test('键位路径：user 固定 <home>/.x-harness/agents；project 固定 <项目>/.x-harness/agents', () => {
    expect(agentDefinitionPath('/home/u', 'user', null, 'search')).toBe('/home/u/.x-harness/agents/search.md');
    expect(agentDefinitionPath('/home/u', 'project', '/work/app', 'search')).toBe('/work/app/.x-harness/agents/search.md');
  });
});
