import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { MarkdownText } from '../markdown-text';

/**
 * 渲染冒烟：经 react-dom/server 走完整 streamdown 管道（解析/净化/组件映射），
 * 验证对话正文常用 markdown 形态渲染不抛错且产出预期 DOM。
 * demo workspace（demo-workspace.ts 的 greeting 与 text-report 块）提供应用内人工核对路径，
 * 覆盖同一批形态：列表/行内代码/sh 围栏/表格/链接。
 */
describe('MarkdownText 渲染冒烟', () => {
  test('表格、围栏代码、链接、行内标记混合渲染不抛错', () => {
    const markdown = [
      '汇总如下:',
      '',
      '| 模块 | 结论 |',
      '| --- | --- |',
      '| `core/adapters` | sink 双活 |',
      '| `router` | trie 兜底 |',
      '',
      '```sh',
      'bun run lint',
      '```',
      '',
      '详见 [分析报告](https://example.com/docs/analysis)。',
    ].join('\n');
    const html = renderToStaticMarkup(<MarkdownText text={markdown} />);
    expect(html).toContain('<table');
    expect(html).toContain('data-streamdown="code-block"');
    expect(html).toContain('data-streamdown="inline-code"');
    expect(html).toContain('<a');
    expect(html).toContain('href="https://example.com/docs/analysis"');
  });

  test('http(s) 链接带拦截点击所需的出口语义（rel/target 由 harden 附加）', () => {
    const html = renderToStaticMarkup(<MarkdownText text="[docs](https://example.com)" />);
    expect(html).toContain('<a');
    expect(html).toContain('href="https://example.com/"');
    expect(html).toContain('rel="noopener noreferrer"');
  });

  test('非 http(s) 链接降级为纯文本，href 不落入 DOM', () => {
    const html = renderToStaticMarkup(<MarkdownText text="click [x](javascript:alert(1)) here" />);
    expect(html).not.toContain('<a');
    expect(html).not.toContain('javascript:');
    expect(html).toContain('<span');
    expect(html).toContain('click ');
  });

  test('流式未闭合围栏不抛错（remend 修补）', () => {
    const html = renderToStaticMarkup(<MarkdownText text={'before\n\n```ts\nconst a = 1;'} />);
    expect(html).toContain('data-streamdown="code-block"');
    expect(html).toContain('const a = 1;');
  });

  test('空文本渲染为空', () => {
    expect(renderToStaticMarkup(<MarkdownText text="" />)).toBe('');
  });
});
