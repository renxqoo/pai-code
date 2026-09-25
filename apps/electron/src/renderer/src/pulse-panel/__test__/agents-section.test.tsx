import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import type { SubagentModel } from '@/thread/thread-model';

import { AgentsSection } from '../agents-section';

/**
 * 智能体分区（T44）：无子代理整区隐藏、工作中计数 meta、行渲染与折叠收放。
 */

function noop(): void {}

function agent(id: string, status: SubagentModel['status'], taskText: string): SubagentModel {
  return {
    id,
    agentId: id,
    name: id,
    agentType: 'explore',
    task: taskText,
    model: '',
    effort: '',
    tokens: null,
    toolCount: 0,
    status,
    startedAt: 1_000,
    endedAt: status === 'running' ? null : 2_000,
    summary: '',
    pendingAsk: null,
    tools: [],
  };
}

const agents = [agent('explore-1', 'running', '摸清前端架构'), agent('worker-2', 'stopped', '实现组件')];

describe('AgentsSection', () => {
  test('无子代理整区隐藏', () => {
    expect(renderToStaticMarkup(<AgentsSection agents={[]} now={0} open onOpenChange={noop} onSelect={noop} />)).toBe('');
  });

  test('行渲染 + 工作中计数 meta', () => {
    const html = renderToStaticMarkup(<AgentsSection agents={agents} now={5_000} open onOpenChange={noop} onSelect={noop} />);
    expect(html).toContain('智能体');
    expect(html).toContain('1 工作中');
    expect(html).toContain('explore-1');
    expect(html).toContain('摸清前端架构');
    expect(html).toContain('worker-2');
  });

  test('全不工作中不显计数 meta', () => {
    const html = renderToStaticMarkup(<AgentsSection agents={[agent('a', 'stopped', 't')]} now={0} open onOpenChange={noop} onSelect={noop} />);
    expect(html).not.toContain('工作中');
  });

  test('折叠态收起行内容（aria-expanded=false）', () => {
    const html = renderToStaticMarkup(<AgentsSection agents={agents} now={0} open={false} onOpenChange={noop} onSelect={noop} />);
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain('explore-1');
  });
});
