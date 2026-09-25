import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import type { SubagentModel } from '@/thread/thread-model';

import { RunningBar } from '../running-bar';
import { RunningChip } from '../running-chip';

/**
 * 运行态呈现（T44）：面板底部运行条与收起态浮动胶囊——无运行中不出（不摆假控件）、
 * 首个运行中任务一行 + 计时、多运行中 +N 归并。
 */

function noop(): void {}

function running(id: string, taskText: string): SubagentModel {
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
    status: 'running',
    startedAt: 1_000,
    endedAt: null,
    summary: '',
    pendingAsk: null,
    tools: [],
  };
}

describe('RunningBar', () => {
  test('无运行中不渲染', () => {
    expect(renderToStaticMarkup(<RunningBar running={[]} now={0} onOpen={noop} />)).toBe('');
  });

  test('单运行中：任务文本 + 计时（无 +N）', () => {
    const html = renderToStaticMarkup(<RunningBar running={[running('a', '装置加装')]} now={61_000} onOpen={noop} />);
    expect(html).toContain('装置加装');
    expect(html).toContain('1m 0s');
    expect(html).not.toContain('+');
    expect(html).toContain('1 个子智能体运行中');
  });

  test('多运行中：+N 归并（无障碍名含总数；只显首个任务）', () => {
    const html = renderToStaticMarkup(<RunningBar running={[running('a', 'alpha-task'), running('b', 'beta-task')]} now={2_000} onOpen={noop} />);
    expect(html).toContain('+1');
    expect(html).toContain('2 个子智能体运行中');
    expect(html).toContain('alpha-task');
    expect(html).not.toContain('beta-task');
  });

  test('任务文本缺位回落 agent 名', () => {
    expect(renderToStaticMarkup(<RunningBar running={[running('fallback-agent', '')]} now={0} onOpen={noop} />)).toContain('fallback-agent');
  });
});

describe('RunningChip', () => {
  test('无运行中不渲染', () => {
    expect(renderToStaticMarkup(<RunningChip running={[]} now={0} onOpen={noop} />)).toBe('');
  });

  test('运行胶囊：任务文本 + 计时（收起态载体）', () => {
    const html = renderToStaticMarkup(<RunningChip running={[running('a', '复现：ui-e2e 场景')]} now={31_000} onOpen={noop} />);
    expect(html).toContain('复现：ui-e2e 场景');
    expect(html).toContain('30s');
    expect(html).toContain('rounded-full');
  });
});
