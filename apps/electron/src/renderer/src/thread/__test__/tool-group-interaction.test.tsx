import { describe, expect, test } from 'bun:test';
import * as React from 'react';

import { ToolGroup } from '../tool-group';
import { ToolsBlock } from '../tools-block';
import type { ToolCallModel } from '../thread-model';
import { installDom } from '@/testing/dom';
import { render } from '@/testing/render';

function call(name: string, id: string): ToolCallModel {
  return { id, name, argsPreview: `${name} src/a.ts`, subagents: [], editHunks: [], output: '', exitCode: 0, durationMs: 10, status: 'ok' };
}

function groupHeader(container: HTMLElement): HTMLButtonElement {
  const button = container.querySelector('button[aria-expanded]');
  if (button === null) throw new Error('组头未渲染');
  return button as HTMLButtonElement;
}

describe('ToolGroup 开合交互（客户端渲染）', () => {
  test('点击组头在收起/展开间翻转，调用行随之进出 DOM', () => {
    installDom();
    const view = render(<ToolGroup calls={[call('bash', 'a'), call('edit', 'b')]} />);
    const button = groupHeader(view.container);
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(view.container.textContent).not.toContain('bash src/a.ts');

    React.act(() => {
      button.click();
    });
    expect(groupHeader(view.container).getAttribute('aria-expanded')).toBe('true');
    expect(view.container.textContent).toContain('bash src/a.ts');
    expect(view.container.textContent).toContain('edit src/a.ts');

    React.act(() => {
      groupHeader(view.container).click();
    });
    expect(groupHeader(view.container).getAttribute('aria-expanded')).toBe('false');
    expect(view.container.textContent).not.toContain('bash src/a.ts');
    view.unmount();
  });

  test('失败批次自动展开后，手动收起再展开保持用户意图（不被自动策略收回）', () => {
    installDom();
    const view = render(
      <ToolGroup calls={[call('bash', 'a'), { ...call('edit', 'b'), status: 'failed', exitCode: 1 }]} />,
    );
    expect(groupHeader(view.container).getAttribute('aria-expanded')).toBe('true');

    React.act(() => {
      groupHeader(view.container).click();
    });
    expect(groupHeader(view.container).getAttribute('aria-expanded')).toBe('false');

    React.act(() => {
      groupHeader(view.container).click();
    });
    expect(groupHeader(view.container).getAttribute('aria-expanded')).toBe('true');
    view.unmount();
  });

  test('症状回归：并行组合并时先开后关闪一下——第 2 个调用到达合组后不自动展开（运行中与完成态都收起），失败才展开', () => {
    installDom();
    const running = (id: string, name: string): ToolCallModel => ({ ...call(name, id), status: 'running', exitCode: null });
    const view = render(<ToolsBlock calls={[running('a', 'bash')]} />);
    // 单调用直出行：无组头开关
    expect(view.container.querySelector('button[aria-expanded]')).toBeNull();

    // 第 2 个调用到达 → 合并成组：running 不自动展开——「开始即展开、完成即收起」
    // 的开合对在快批次下就是合并时的先开后关闪现
    view.rerender(<ToolsBlock calls={[running('a', 'bash'), running('b', 'edit')]} />);
    expect(groupHeader(view.container).getAttribute('aria-expanded')).toBe('false');
    expect(view.container.textContent).not.toContain('bash src/a.ts');

    // 批次完成（全 ok）：保持收起，不出现「先显示又关闭」
    view.rerender(<ToolsBlock calls={[call('bash', 'a'), call('edit', 'b')]} />);
    expect(groupHeader(view.container).getAttribute('aria-expanded')).toBe('false');

    // 失败批次仍自动展开（错误必须看得见）
    view.rerender(
      <ToolsBlock calls={[call('bash', 'a'), { ...call('edit', 'b'), status: 'failed', exitCode: 1 }]} />,
    );
    expect(groupHeader(view.container).getAttribute('aria-expanded')).toBe('true');
    view.unmount();
  });
});
