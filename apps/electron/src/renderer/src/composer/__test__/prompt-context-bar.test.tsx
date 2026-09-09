import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { PromptContextBar } from '../prompt-context-bar';

const PROJECT = { label: 'app', title: '/w/app', ariaLabel: '工作目录' };

describe('PromptContextBar', () => {
  test('只读形态（缺 onSelect）：两段都是文本，无按钮', () => {
    const html = renderToStaticMarkup(
      <PromptContextBar project={PROJECT} branch={{ label: 'main', ariaLabel: '当前分支' }} />,
    );
    expect(html).toContain('app');
    expect(html).toContain('main');
    expect(html).not.toContain('<button');
    expect(html).toContain('title="/w/app"');
  });

  test('可切形态（给 onSelect）：两段都是带无障碍名的按钮（新任务页）', () => {
    const html = renderToStaticMarkup(
      <PromptContextBar
        project={{ ...PROJECT, onSelect: () => undefined }}
        branch={{ label: 'main', ariaLabel: '当前分支', onSelect: () => undefined }}
      />,
    );
    expect(html).toContain('aria-label="工作目录"');
    expect(html).toContain('aria-label="当前分支"');
    expect(html.match(/<button/g)?.length).toBe(2);
  });

  test('无工作目录：项目段不渲染，分支段仍在（空形态文案）', () => {
    const html = renderToStaticMarkup(
      <PromptContextBar project={null} branch={{ label: '非 git 仓库', muted: true, ariaLabel: '当前分支' }} />,
    );
    expect(html).toContain('非 git 仓库');
    expect(html).not.toContain('app');
  });

  test('分支段 null（未选工作目录）：只渲染项目段，不拿「分支不可用」冒充未选状态', () => {
    const html = renderToStaticMarkup(
      <PromptContextBar project={{ ...PROJECT, onSelect: () => undefined }} branch={null} />,
    );
    expect(html).toContain('app');
    expect(html.match(/<button/g)?.length).toBe(1);
  });

  test('分支段可点、项目段只读：只有分支是按钮（非仓库目录不可切）', () => {
    const html = renderToStaticMarkup(
      <PromptContextBar
        project={PROJECT}
        branch={{ label: 'main', ariaLabel: '当前分支', onSelect: () => undefined }}
      />,
    );
    expect(html.match(/<button/g)?.length).toBe(1);
    expect(html).toContain('aria-label="当前分支"');
    expect(html).not.toContain('aria-label="工作目录"');
  });
});
