import { describe, expect, test } from 'bun:test';

import { agentDefinitionPath, parseAgentDefinition, serializeAgentDefinition } from '../agent-definition-file';

/**
 * 定义文件编解码回归：hub agent-definitions.ts 的文件契约（frontmatter + 正文）。
 * 序列化产物必须能被本解析器与 hub 的 YAML 解析器同时接受（单行标量 + 列表项）。
 */
describe('agent 定义 md 编解码', () => {
  test('序列化 → 解析往返（tools 列表 + model + 提示词正文）', () => {
    const text = serializeAgentDefinition({
      name: 'search',
      description: "联网搜索: '专员'（含引号）",
      systemPrompt: '你是搜索专员。\n\n## 工具\n\n只有 bash。',
      tools: ['read', 'bash'],
      model: 'glm/glm-4.7',
    });
    const parsed = parseAgentDefinition(text);
    expect(parsed).toEqual({
      name: 'search',
      description: "联网搜索: '专员'（含引号）",
      systemPrompt: '你是搜索专员。\n\n## 工具\n\n只有 bash。\n',
      tools: ['read', 'bash'],
      model: 'glm/glm-4.7',
    });
  });

  test('tools/model 为 null 时字段整体不写（= hub 运行期继承语义）', () => {
    const text = serializeAgentDefinition({ name: 'a', description: 'd', systemPrompt: 'p', tools: null, model: null });
    expect(text).not.toContain('tools');
    expect(text).not.toContain('model');
    expect(parseAgentDefinition(text)?.tools).toBeNull();
    expect(parseAgentDefinition(text)?.model).toBeNull();
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

  test('description 换行折叠为空格（frontmatter 保单行标量）', () => {
    const text = serializeAgentDefinition({ name: 'a', description: '第一行\n第二行', systemPrompt: '', tools: null, model: null });
    const parsed = parseAgentDefinition(text);
    expect(parsed?.description).toBe('第一行 第二行');
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

  test('键位路径：user 固定 agentDir/agents；project 固定 <项目>/.pi/agents', () => {
    expect(agentDefinitionPath('/ad', 'user', null, 'search')).toBe('/ad/agents/search.md');
    expect(agentDefinitionPath('/ad', 'project', '/work/app', 'search')).toBe('/work/app/.pi/agents/search.md');
  });
});
