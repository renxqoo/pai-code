import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { render } from '@/testing/render';
import { MarkdownText } from '../markdown-text';

/**
 * 渲染冒烟：经 react-dom/server 走完整 streamdown 管道（解析/净化/组件映射），
 * 验证对话正文常用 markdown 形态渲染不抛错且产出预期 DOM。
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

  test('代码块头部只有复制控件，无下载入口', () => {
    const html = renderToStaticMarkup(<MarkdownText text={'```ts\nconst a = 1;\n```'} />);
    expect(html).toContain('data-streamdown="code-block-copy-button"');
    expect(html).not.toContain('data-streamdown="code-block-download-button"');
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

describe('MarkdownText 块冻结分裂形态（T37）', () => {
  const multiBlock = [
    '# 冻结渲染',
    '',
    '第一段，含 **加粗** 与 `行内码`。',
    '',
    '| A | B |',
    '| --- | --- |',
    '| 1 | 2 |',
    '',
    '```ts',
    'const tail = true;',
    '```',
    '',
    '收尾段落。',
  ].join('\n');

  function normalizeWhitespace(html: string): string {
    return html.replace(/\s+/g, ' ').trim();
  }

  test('多块文本分裂渲染：容器 + md-chunk 片段在场，内容完整', () => {
    const html = renderToStaticMarkup(<MarkdownText text={multiBlock} />);
    expect(html).toContain('chat-markdown');
    expect(html).toContain('md-chunk');
    expect(html).toContain('<table');
    expect(html).toContain('data-streamdown="code-block"');
    expect(html).toContain('收尾段落。');
  });

  test('终态同构：增量到达与一次性到达的最终渲染内容一致', () => {
    // 增量路径：同一组件实例逐段长文本（走缓存增量切尾）
    const handle = render(<MarkdownText text={multiBlock.slice(0, 1)} />);
    const chunks: string[] = [multiBlock.slice(0, 1)];
    const step = 24;
    for (let len = step; len < multiBlock.length; len += step) {
      chunks.push(multiBlock.slice(chunks.join('').length, len));
      const soFar = multiBlock.slice(0, len);
      handle.rerender(<MarkdownText text={soFar} />);
    }
    handle.rerender(<MarkdownText text={multiBlock} />);
    const incremental = normalizeWhitespace(handle.container.textContent ?? '');

    // 全量路径：全新挂载一次性全文
    const fresh = render(<MarkdownText text={multiBlock} />);
    const once = normalizeWhitespace(fresh.container.textContent ?? '');

    expect(incremental).toBe(once);
    expect(incremental).toContain('const tail = true;');

    // 结构同构：块级类型序列（heading/code-block/table…）逐位一致，拦结构性回归
    const blockSequence = (root: HTMLElement | null): string =>
      Array.from(root?.querySelectorAll('[data-streamdown]') ?? [])
        .map((element) => element.getAttribute('data-streamdown'))
        .join(',');
    expect(blockSequence(handle.container)).toBe(blockSequence(fresh.container));

    handle.unmount();
    fresh.unmount();
  });

  test('流式追加不重挂冻结块（DOM 节点同一）', () => {
    const head = '冻结头部段落。\n\n';
    const handle = render(<MarkdownText text={`${head}尾区`} />);
    const firstChunk = handle.container.querySelector('.md-chunk');
    expect(firstChunk).not.toBeNull();
    handle.rerender(<MarkdownText text={`${head}尾区继续增长的内容`} />);
    expect(handle.container.querySelector('.md-chunk')).toBe(firstChunk);
    handle.unmount();
  });

  test('脚注文本回退整文单实例（无 md-chunk）且内容在场', () => {
    const html = renderToStaticMarkup(<MarkdownText text={'正文引用[^1]。\n\n[^1]: 脚注定义。'} />);
    expect(html).not.toContain('md-chunk');
    expect(html).toContain('正文引用');
    expect(html).toContain('脚注定义');
  });
});
