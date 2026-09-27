import { describe, expect, test } from 'bun:test';
import * as React from 'react';

import { FileDiffSection } from '../file-diff-section';
import { installDom } from '@/testing/dom';
import { render } from '@/testing/render';
import type { ToolCallModel } from '../thread-model';

function call(id: string, hunks: ToolCallModel['editHunks']): ToolCallModel {
  return {
    id,
    name: 'edit',
    argsPreview: 'a.ts',
    subagents: [],
    editHunks: hunks,
    output: '',
    exitCode: 0,
    durationMs: 5,
    status: 'ok',
  };
}

const hunk = (path: string, oldText: string, newText: string) => ({ oldText, newText, path });

function title(container: HTMLElement): HTMLButtonElement {
  const button = container.querySelector('button[aria-expanded]');
  if (button === null) throw new Error('文件 diff 标题未渲染');
  return button as HTMLButtonElement;
}

describe('FileDiffSection 展开交互（客户端渲染）', () => {
  test('同一文件两次编辑：合成一个 diff，点开见全部补丁', () => {
    installDom();
    const view = render(
      <FileDiffSection
        calls={[
          call('c1', [hunk('src/a.ts', 'const a = 1;', 'const a = 2;')]),
          call('c2', [hunk('src/a.ts', 'export default f;', 'export default g;')]),
        ]}
      />,
    );
    // 一个文件 = 一个可展开行
    expect(view.container.querySelectorAll('button[aria-expanded]')).toHaveLength(1);
    expect(title(view.container).getAttribute('aria-expanded')).toBe('false');
    expect(view.container.textContent).not.toContain('const a = 1;');

    React.act(() => {
      title(view.container).click();
    });
    expect(title(view.container).getAttribute('aria-expanded')).toBe('true');
    // 两次编辑的补丁都在这一个 diff 里
    expect(view.container.textContent).toContain('const a = 1;');
    expect(view.container.textContent).toContain('const a = 2;');
    expect(view.container.textContent).toContain('export default f;');
    expect(view.container.textContent).toContain('export default g;');
    view.unmount();
  });

  test('多文件：各自独立开合，互不影响', () => {
    installDom();
    const view = render(
      <FileDiffSection
        calls={[call('c1', [hunk('src/a.ts', 'x', 'y')]), call('c2', [hunk('src/b.ts', 'p', 'q')])]}
      />,
    );
    const buttons = [...view.container.querySelectorAll('button[aria-expanded]')] as HTMLButtonElement[];
    expect(buttons).toHaveLength(2);

    React.act(() => {
      buttons[0]?.click();
    });
    const after = [...view.container.querySelectorAll('button[aria-expanded]')] as HTMLButtonElement[];
    expect(after[0]?.getAttribute('aria-expanded')).toBe('true');
    expect(after[1]?.getAttribute('aria-expanded')).toBe('false');
    expect(view.container.textContent).toContain('y');
    expect(view.container.textContent).not.toContain('q');
    view.unmount();
  });
});
