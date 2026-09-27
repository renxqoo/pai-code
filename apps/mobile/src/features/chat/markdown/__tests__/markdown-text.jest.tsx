import { fireEvent, render } from '@testing-library/react-native';
import { describe, expect, it, jest } from '@jest/globals';
import * as React from 'react';
import { Linking } from 'react-native';
import { MarkdownText } from '@/features/chat/markdown/markdown-text';
import { markdownStyles } from '@/features/chat/markdown/markdown-theme';
import { isSafeExternalUrl } from '@/features/chat/markdown/safe-external-url';
import { darkColors, lightColors } from '@/theme/colors';
import { monospaceFont } from '@/components/monospace-font';

/** 样式落点断言辅助（渲染树样式可能落数组，拍平后取字段）。 */
const styleOf = (node: { props: { style?: unknown } }): Record<string, unknown> => {
  const entries = (Array.isArray(node.props.style) ? node.props.style : [node.props.style]) as readonly (Record<string, unknown> | undefined)[];
  return Object.assign({}, ...entries.map((entry) => entry ?? {}));
};

describe('MarkdownText', () => {
  it('renders headings as headers, list items and dividers', async () => {
    const view = await render(<MarkdownText source={'# 标题\n\n- 一项\n- 二项\n\n1. 先\n2. 后\n\n---'} />);
    expect(view.getByRole('header').props.children).toContain('标题');
    expect(view.getByText('一项')).toBeTruthy();
    expect(view.getByText('二项')).toBeTruthy();
    expect(view.getByText('先')).toBeTruthy();
    expect(view.getByText('后')).toBeTruthy();
    expect(view.getByTestId('markdown-divider')).toBeTruthy();
  });

  it('renders ordered lists starting at their markdown number', async () => {
    const view = await render(<MarkdownText source={'5. 五\n6. 六'} />);
    expect(view.getByText('五')).toBeTruthy();
    expect(view.getByText('六')).toBeTruthy();
  });

  it('nested lists keep nested items and bare fences fall back to plain language', async () => {
    const view = await render(<MarkdownText source={'1. 一\n   1. 子一\n\n```\nplain\n```'} />);
    expect(view.getByText('一')).toBeTruthy();
    expect(view.getByText('子一')).toBeTruthy();
    expect(view.getByText('text')).toBeTruthy();
    expect(view.getByText('plain')).toBeTruthy();
  });

  it('renders inline strong, emphasis and code with theme styles', async () => {
    const view = await render(<MarkdownText source={'段落 **粗体** *斜体* `行内代码`'} />);
    expect(styleOf(view.getByText('粗体'))).toMatchObject({ fontWeight: '700' });
    expect(styleOf(view.getByText('斜体'))).toMatchObject({ fontStyle: 'italic' });
    expect(styleOf(view.getByText('行内代码'))).toMatchObject({ fontFamily: monospaceFont });
  });

  it('renders quote and fenced code with collapsible long content（唯一 CodeBlock）', async () => {
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
    expect(styleOf(view.getByText('官网'))).toMatchObject({ textDecorationLine: 'underline' });
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

  it('degrades garbage markdown: HTML 剥标签、图片取 alt，不崩', async () => {
    const view = await render(<MarkdownText source={'![图](img.png) <b>x</b> |a|b|\n\n??? **'} />);
    expect(view.getByText(/x/)).toBeTruthy();
    expect(view.queryByText(/<b>/)).toBeNull();
    expect(view.getByText('图')).toBeTruthy();
    expect(view.queryByRole('header')).toBeNull();
  });

  it('renders nothing for empty source', async () => {
    const view = await render(<MarkdownText source="" />);
    expect(view.toJSON()).toBeNull();
  });

  it('GFM 全量 + CJK：表格/删除线/任务列表渲染（T56 新能力）', async () => {
    const view = await render(
      <MarkdownText
        source={['中文表格测试', '', '| 列一 | 列二 |', '| --- | --- |', '| 甲 | 乙 |', '', '~~删除线~~', '', '- [x] 已办任务'].join('\n')}
      />,
    );
    expect(view.getByText('中文表格测试')).toBeTruthy();
    expect(view.getByText('列一')).toBeTruthy();
    expect(view.getByText('甲')).toBeTruthy();
    expect(styleOf(view.getByText('删除线'))).toMatchObject({ textDecorationLine: 'line-through' });
    expect(view.getByText('☑ 已办任务')).toBeTruthy();
  });

  it('病理输入降级不崩（深层嵌套/未闭合围栏/超长行/畸形表格）', async () => {
    const deepNest = `${'> '.repeat(200)}深底`;
    const longLine = 'x'.repeat(20_000);
    const garbage = [deepNest, '', '```js', 'unclosed fence content', longLine, '', '| a |', '| --- | --- | extra', '|'].join('\n');
    const view = await render(<MarkdownText source={garbage} />);
    expect(view.toJSON()).toBeTruthy();
  });

  it('非 http/https 图片降级 alt 文本，安全图片可渲染（T56 不变量 1）', async () => {
    const unsafe = await render(<MarkdownText source={'![危险图](file:///etc/passwd)'} />);
    expect(unsafe.getByText('危险图')).toBeTruthy();
    const safe = await render(<MarkdownText source={'![安全图](https://example.com/a.png)'} />);
    expect(safe.toJSON()).toBeTruthy();
    expect(safe.queryByText('安全图')).toBeNull();
  });

  it('链接图片任一不安全即降级 alt；空 alt 不渲染（T56 不变量 1）', async () => {
    const badLink = await render(<MarkdownText source={'[![外链图](https://example.com/a.png)](file:///etc/passwd)'} />);
    expect(badLink.getByText('外链图')).toBeTruthy();
    const goodLink = await render(<MarkdownText source={'[![双全](https://example.com/a.png)](https://example.com)'} />);
    expect(goodLink.queryByText('双全')).toBeNull();
    const emptyAlt = await render(<MarkdownText source={'![](file:///etc/passwd)'} />);
    expect(emptyAlt.queryByText(/.+/)).toBeNull();
    expect(emptyAlt.queryByLabelText(/.+/)).toBeNull();
  });
  it('HTML 剥标签后基础实体解码（症状：&lt; 直出成实体乱码）', async () => {
    const view = await render(<MarkdownText source={'<div>\n&lt;code&gt; &amp;amp;\n</div>'} />);
    expect(view.getByText(/<code>/)).toBeTruthy();
    expect(view.getByText(/&amp;/)).toBeTruthy();
  });

  it('深层嵌套降级纯文本不崩（症状：9000 层引用链 RangeError 整屏崩溃）', async () => {
    const deep = `${'> '.repeat(9000)}深底`;
    const view = await render(<MarkdownText source={deep} />);
    expect(view.getByText(deep)).toBeTruthy();
    expect(view.toJSON()).toBeTruthy();
  });

  it('任务列表勾选态可见（症状：[x] 与普通无序列表渲染无差别）', async () => {
    const view = await render(<MarkdownText source={'- [x] 已办\n- [ ] 待办'} />);
    expect(view.getByText('☑ 已办')).toBeTruthy();
    expect(view.getByText('☐ 待办')).toBeTruthy();
  });

  it('空主机链接不触发打开（症状：https:///etc 等 // 后非主机形态被放行）', async () => {
    const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    const view = await render(<MarkdownText source={'[a](https:///etc/passwd) [b](https://:8080/p) [c](https://?q)'} />);
    expect(view.queryAllByRole('link')).toHaveLength(0);
    await fireEvent.press(view.getByText('a'));
    await fireEvent.press(view.getByText('b'));
    await fireEvent.press(view.getByText('c'));
    expect(openURL).not.toHaveBeenCalled();
    openURL.mockRestore();
  });

  it('深色主题强调系显式钉色（症状：深色底上粗体/行内码渲成 #333 隐形）', () => {
    expect(markdownStyles(lightColors).strong).toMatchObject({ color: lightColors.text });
    expect(markdownStyles(darkColors).strong).toMatchObject({ color: darkColors.text });
    expect(markdownStyles(darkColors).em).toMatchObject({ color: darkColors.text });
    expect(markdownStyles(darkColors).strikethrough).toMatchObject({ color: darkColors.text });
    expect(markdownStyles(darkColors).codespan).toMatchObject({
      color: darkColors.text,
      backgroundColor: darkColors.surfaceSubtle,
    });
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
    ['https:///etc/passwd', false],
    ['https://:8080/p', false],
    ['https://?q', false],
    ['https://#f', false],
    ['https://\\evil.com', false],
    ['https://\u3000evil.com', false],
    ['http://127.0.0.1:8080/x', true],
    ['https://[::1]:3000/path', true],
    ['https://ex.com:123456', false],
  ])('classifies %s as %s', (href, expected) => {
    expect(isSafeExternalUrl(href)).toBe(expected);
  });
});
