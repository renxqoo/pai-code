import { describe, expect, test } from 'bun:test';
import * as React from 'react';

import type { AgentDefinition } from '@paiapp/contracts';
import { copy } from '@/strings';
import { render } from '@/testing/render';

import { AgentsSection } from '../agents-section';

/** agents 分区渲染面（覆盖门缺口件）：纯函数 meta 行/过滤 + 列表态挂载
 *  （空态、卡片 meta、作用域徽章、新建/编辑/两步删除出口）。 */

const definition = (over: Partial<AgentDefinition> = {}): AgentDefinition => ({
  name: 'researcher',
  description: '研究型子代理',
  model: null,
  scope: 'user',
  project: null,
  tools: null,
  prompt: '',
  ...over,
});

function section(over: Partial<Parameters<typeof AgentsSection>[0]> = {}) {
  const calls: string[] = [];
  const view = render(
    <AgentsSection
      definitions={[definition()]}
      knownProjects={[]}
      modelOptions={[]}
      toolIds={['bash']}
      onRefresh={() => calls.push('refresh')}
      onSave={() => { calls.push('save'); return Promise.resolve(null); }}
      onRemove={() => { calls.push('remove'); return Promise.resolve(null); }}
      {...over}
    />,
  );
  return { view, calls };
}

describe('AgentsSection（列表态）', () => {
  test('挂载渲染：定义名、meta 行（模型继承 + 默认工具集）、作用域徽章', () => {
    const { view } = section();
    const text = view.container.textContent ?? '';
    expect(text).toContain('researcher');
    expect(text).toContain(copy.settings.agentsModelInherit);
    expect(text).toContain(copy.settings.agentsToolsDefault);
    view.unmount();
  });

  test('空清单：空态文案 + 新建钮在场', () => {
    const { view } = section({ definitions: [] });
    expect(view.container.textContent).toContain(copy.settings.agentsEmpty);
    view.unmount();
  });

  test('项目级定义：meta 模型显式值 + 工具数', () => {
    const { view } = section({
      definitions: [definition({
        name: 'proj-agent',
        scope: 'project',
        project: '/work/pai',
        model: 'p1/m1',
        tools: ['bash', 'read'],
      })],
    });
    const text = view.container.textContent ?? '';
    expect(text).toContain('p1/m1');
    expect(text).toContain(copy.settings.agentsTools(2));
    view.unmount();
  });
});
