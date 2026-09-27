import { describe, expect, test } from 'bun:test';
import * as React from 'react';

import { ToolGroup } from '../tool-group';
import type { ToolCallModel } from '../thread-model';
import { installDom } from '@/testing/dom';
import { render } from '@/testing/render';

function call(name: string, id: string): ToolCallModel {
  return { id, name, argsPreview: `${name} 参数`, subagents: [], editHunks: [], output: '', exitCode: 0, durationMs: 10, status: 'ok' };
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
    expect(view.container.textContent).not.toContain('bash 参数');

    React.act(() => {
      button.click();
    });
    expect(groupHeader(view.container).getAttribute('aria-expanded')).toBe('true');
    expect(view.container.textContent).toContain('bash 参数');
    expect(view.container.textContent).toContain('edit 参数');

    React.act(() => {
      groupHeader(view.container).click();
    });
    expect(groupHeader(view.container).getAttribute('aria-expanded')).toBe('false');
    expect(view.container.textContent).not.toContain('bash 参数');
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
});
