import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { copy } from '@/strings';
import { en } from '@/strings/en';
import { zh } from '@/strings/zh';

import { AgentStatusButton } from '../agent-status-button';

function noop(): void {}

/**
 * 徽标渲染边界（静态 markup 口径）：count<=0 隐藏、count=1 单数文案分叉、
 * count>1 复数；无障碍名含计数（徽标数字本体 aria-hidden）。
 * 点击接线由 IconButton.onClick 承载，真机走查覆盖（仓库组件测试口径）。
 */
describe('输入框子代理状态徽标（AgentStatusButton）', () => {
  test('count=0 与负数：不渲染任何节点', () => {
    expect(renderToStaticMarkup(<AgentStatusButton count={0} onOpen={noop} />)).toBe('');
    expect(renderToStaticMarkup(<AgentStatusButton count={-1} onOpen={noop} />)).toBe('');
  });

  test('count=1：显示徽标 1，无障碍名走单数分叉', () => {
    const html = renderToStaticMarkup(<AgentStatusButton count={1} onOpen={noop} />);
    expect(html).toContain(copy.flow.agentsWorking(1));
    expect(html).toContain('>1<');
  });

  test('count=2：显示徽标 2，无障碍名走复数', () => {
    const html = renderToStaticMarkup(<AgentStatusButton count={2} onOpen={noop} />);
    expect(html).toContain(copy.flow.agentsWorking(2));
    expect(html).toContain('>2<');
  });

  test('双语单复数分叉：en 表 1/2 两支成型，zh 表无分叉恒同型', () => {
    expect(en.flow.agentsWorking(1)).toBe('1 subagent working — open the Agents panel');
    expect(en.flow.agentsWorking(2)).toBe('2 subagents working — open the Agents panel');
    expect(zh.flow.agentsWorking(1)).toBe(zh.flow.agentsWorking(2).replace('2', '1'));
  });
});
