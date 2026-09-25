import { fireEvent, render } from '@testing-library/react-native';
import { describe, expect, it, jest } from '@jest/globals';
import * as React from 'react';
import { Linking } from 'react-native';
import { MarkdownText } from '@/features/chat/markdown/markdown-text';
import { MarkdownBlock } from '@/features/chat/markdown/markdown-block';
import { isSafeExternalUrl } from '@/features/chat/markdown/safe-external-url';
import { monospaceFont } from '@/components/monospace-font';

describe('MarkdownText', () => {
  it('renders headings as headers, lists with markers and dividers', async () => {
    const view = await render(<MarkdownText source={'# 标题\n\n- 一项\n- 二项\n\n1. 先\n2. 后\n\n---'} />);
    expect(view.getByRole('header').props.children).toContain('标题');
    expect(view.getByText('• 一项')).toBeTruthy();
    expect(view.getByText('• 二项')).toBeTruthy();
    expect(view.getByText('1. 先')).toBeTruthy();
    expect(view.getByText('2. 后')).toBeTruthy();
    expect(view.getByTestId('markdown-divider')).toBeTruthy();
  });

  it('renders ordered lists starting at their markdown number', async () => {
    const view = await render(<MarkdownText source={'5. 五\n6. 六'} />);
    expect(view.getByText('5. 五')).toBeTruthy();
    expect(view.getByText('6. 六')).toBeTruthy();
  });

  it('marks nested ordered items and falls back for odd heading levels and bare code', async () => {
    const view = await render(<MarkdownText source={'1. 一\n   1. 子一\n\n```\nplain\n```'} />);
    expect(view.getByText('· 子一')).toBeTruthy();
    expect(view.getByText('text')).toBeTruthy();
    const odd = await render(<MarkdownBlock block={{ kind: 'heading', level: 7, content: [{ kind: 'text', text: '七级' }] }} />);
    expect(odd.getByRole('header').props.style).toMatchObject({ fontSize: 13 });
  });

  it('renders inline strong, emphasis, code and selectable body text', async () => {
    const view = await render(<MarkdownText source={'段落 **粗体** *斜体* `行内代码`'} />);
    expect(view.getByText('粗体').props.style).toMatchObject({ fontWeight: '700' });
    expect(view.getByText('斜体').props.style).toMatchObject({ fontStyle: 'italic' });
    expect(view.getByText('行内代码').props.style).toMatchObject({ fontFamily: monospaceFont });
  });

  it('renders quote and fenced code with collapsible long content', async () => {
    const view = await render(<MarkdownText source={'> 引用内容\n\n```ts\n1\n2\n3\n4\n5\n6\n```'} />);
    expect(view.getByTestId('markdown-quote')).toBeTruthy();
    expect(view.getByText('引用内容')).toBeTruthy();
    expect(view.getByText('ts')).toBeTruthy();
    expect(view.getByText('展开剩余 1 行')).toBeTruthy();
    await fireEvent.press(view.getByText('ts'));
    expect(view.getByText('收起代码')).toBeTruthy();
  });

  it('opens only http/https links and keeps other protocols inert', async () => {
    const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    const view = await render(
      <MarkdownText source={'[官网](https://example.com)\n\n[本地](file:///etc/passwd)\n\n[脚本](javascript:alert(1))'} />,
    );
    await fireEvent.press(view.getByText('官网'));
    expect(openURL).toHaveBeenCalledWith('https://example.com');
    expect(openURL).toHaveBeenCalledTimes(1);
    expect(view.getAllByRole('link')).toHaveLength(1);
    await fireEvent.press(view.getByText('本地'));
    await fireEvent.press(view.getByText('脚本'));
    expect(openURL).toHaveBeenCalledTimes(1);
    openURL.mockRestore();
  });

  it('keeps a link nested inside emphasis clickable', async () => {
    const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    const view = await render(<MarkdownText source={'**[文档](https://example.com)**'} />);
    await fireEvent.press(view.getByText('文档'));
    expect(openURL).toHaveBeenCalledWith('https://example.com');
    openURL.mockRestore();
  });

  it('swallows openURL rejection without crashing the conversation', async () => {
    const openURL = jest.spyOn(Linking, 'openURL').mockRejectedValue(new Error('denied'));
    const view = await render(<MarkdownText source={'[文档](https://example.com)'} />);
    await fireEvent.press(view.getByText('文档'));
    expect(openURL).toHaveBeenCalledTimes(1);
    openURL.mockRestore();
  });

  it('degrades garbage markdown to readable text without crashing', async () => {
    const view = await render(<MarkdownText source={'![图](img.png) <b>x</b> |a|b|\n\n??? **'} />);
    expect(view.getByText(/x/)).toBeTruthy();
    expect(view.queryByText(/<b>/)).toBeNull();
    expect(view.queryByRole('header')).toBeNull();
  });

  it('renders nothing for empty source', async () => {
    const view = await render(<MarkdownText source="" />);
    expect(view.toJSON()).toBeNull();
  });
});

describe('isSafeExternalUrl', () => {
  it.each([
    ['https://example.com', true],
    ['http://example.com/path?q=1', true],
    ['HTTPS://EXAMPLE.COM', true],
    ['javascript:alert(1)', false],
    ['file:///etc/passwd', false],
    ['/relative/path', false],
    ['example.com', false],
    ['', false],
    ['   ', false],
    ['https://', false],
    ['https://.', false],
    ['https://ex.com/a\u0000b', false],
    ['data:text/html,<script>', false],
  ])('classifies %s as %s', (href, expected) => {
    expect(isSafeExternalUrl(href)).toBe(expected);
  });
});
