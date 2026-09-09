import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import type { AgentDefinition } from '@paiapp/contracts';
import { AGENT_TOOL_IDS } from '@paiapp/contracts';
import { copy } from '@/strings';
import { AgentDefinitionForm } from '../agent-definition-form';

/**
 * 渲染冒烟：新建/编辑两形态的字段、面包屑、作用域边界（无已知项目时不渲染 project 段）。
 * 覆盖边界：表单 submit 内的归一化与 reason→文案映射、两步删除交互当前无自动化用例
 * （主进程 store/路由测试只覆盖文件面；交互链路依赖真机走查）。
 */
function noop(): void {}
const MODEL_OPTIONS = ['glm/glm-4.7', 'glm/glm-5.3'];

function makeFormProps(overrides: Partial<Parameters<typeof AgentDefinitionForm>[0]> = {}): Parameters<typeof AgentDefinitionForm>[0] {
  return {
    initial: null,
    previous: null,
    knownProjects: ['/work/app'],
    modelOptions: MODEL_OPTIONS,
    toolIds: [...AGENT_TOOL_IDS],
    onSave: () => Promise.resolve(null),
    onCancel: noop,
    ...overrides,
  };
}

const existing: AgentDefinition = {
  name: 'search',
  description: '联网搜索专员',
  systemPrompt: '你是搜索专员。',
  tools: ['bash'],
  model: 'glm/glm-4.7',
  scope: 'user',
  project: null,
};

describe('agent 定义表单渲染冒烟', () => {
  test('新建：面包屑 + 大标题/副标题 + 六字段 + 工具模式分段（默认所有 = 隐藏工具列表）', () => {
    const html = renderToStaticMarkup(<AgentDefinitionForm {...makeFormProps()} />);
    expect(html).toContain(copy.settings.agentsFormTitleNew);
    expect(html).toContain(copy.settings.agentsFormSubtitleNew);
    expect(html).toContain(copy.settings.agentsTitle);
    for (const label of [copy.settings.agentsFieldName, copy.settings.agentsFieldDescription, copy.settings.agentsFieldPrompt, copy.settings.agentsFieldModel, copy.settings.agentsFieldTools, copy.settings.agentsFieldScope]) {
      expect(html).toContain(label);
    }
    expect(html).toContain(copy.settings.agentsToolsModeAll);
    expect(html).toContain(copy.settings.agentsToolsModeCustom);
    // 新建默认「默认所有工具」：工具词表不渲染（隐藏工具列表）
    for (const tool of AGENT_TOOL_IDS) expect(html).not.toContain(`>${tool}<`);
    expect(html).toContain(copy.settings.agentsModelInherit);
    expect(html).toContain(copy.settings.agentsScopeUser);
    expect(html).toContain(copy.settings.agentsScopeProject);
    // 模型弹窗关态零渲染（T21）
    expect(html).not.toContain(copy.modelPicker.searchPlaceholder);
    expect(html).not.toContain(copy.modelPicker.empty);
  });

  test('编辑带 tools 回填「自定义工具」：工具词表渲染，预填名称/描述/提示词/模型', () => {
    const html = renderToStaticMarkup(
      <AgentDefinitionForm {...makeFormProps({ initial: existing, previous: { file: 'search', scope: 'user', project: null } })} />,
    );
    expect(html).toContain('search');
    expect(html).toContain('联网搜索专员');
    expect(html).toContain('你是搜索专员。');
    expect(html).toContain('glm/glm-4.7');
    expect(html).toContain(copy.settings.agentsFormTitleEdit);
    for (const tool of AGENT_TOOL_IDS) expect(html).toContain(tool);
  });

  test('无已知项目：不渲染「指定项目」段（作用域只剩用户）', () => {
    const html = renderToStaticMarkup(<AgentDefinitionForm {...makeFormProps({ knownProjects: [] })} />);
    expect(html).toContain(copy.settings.agentsScopeUser);
    expect(html).not.toContain(copy.settings.agentsScopeProject);
  });
});
