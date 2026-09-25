import { describe, expect, it } from '@jest/globals';
import { parseMarkdown } from '@/features/chat/markdown/parse-markdown';
import type { MarkdownBlock, MarkdownInline } from '@/features/chat/markdown/markdown-types';

const kinds = (blocks: readonly MarkdownBlock[]): string[] => blocks.map((block) => block.kind);
const inlineKinds = (content: readonly MarkdownInline[]): string[] => content.map((node) => node.kind);
const inlineText = (content: readonly MarkdownInline[]): string =>
  content
    .map((node) => (node.kind === 'text' || node.kind === 'code' ? node.text : inlineText(node.content)))
    .join('');

describe('parseMarkdown', () => {
  it('returns an empty document for empty and blank input', () => {
    expect(parseMarkdown('')).toEqual([]);
    expect(parseMarkdown(' \n\t ')).toEqual([]);
  });

  it('maps every supported block kind in document order', () => {
    const source = [
      '# 标题',
      '',
      '段落 **粗体**。',
      '',
      '- 一项',
      '- 二项',
      '',
      '1. 第一步',
      '2. 第二步',
      '',
      '> 引用内容',
      '',
      '---',
      '',
      '```ts',
      'const value = 1;',
      '```',
    ].join('\n');
    const blocks = parseMarkdown(source);
    expect(kinds(blocks)).toEqual(['heading', 'paragraph', 'list', 'list', 'quote', 'divider', 'code']);
    expect(blocks[0]).toMatchObject({ kind: 'heading', level: 1 });
    expect(blocks[1]?.kind === 'paragraph' ? inlineKinds(blocks[1].content) : []).toEqual(['text', 'strong', 'text']);
    expect(blocks[2]).toMatchObject({ kind: 'list', ordered: false, start: 1 });
    expect(blocks[3]).toMatchObject({ kind: 'list', ordered: true, start: 1 });
    expect(blocks[6]).toMatchObject({ kind: 'code', language: 'ts', code: 'const value = 1;' });
  });

  it('maps every supported inline kind and flattens strike text', () => {
    const blocks = parseMarkdown('普通 **粗体** *斜体* `代码` [链接](https://example.com) 与 ~~删除~~');
    const content = blocks[0]?.kind === 'paragraph' ? blocks[0].content : [];
    expect(inlineKinds(content)).toContain('text');
    expect(inlineKinds(content)).toContain('strong');
    expect(inlineKinds(content)).toContain('emphasis');
    expect(inlineKinds(content)).toContain('code');
    expect(inlineKinds(content)).toContain('link');
    const link = content.find((node) => node.kind === 'link');
    expect(link).toMatchObject({ href: 'https://example.com' });
    expect(link?.kind === 'link' ? inlineText(link.content) : '').toBe('链接');
    expect(inlineText(content)).toContain('删除');
    expect(inlineKinds(content)).not.toContain('html');
  });

  it('keeps a link nested inside emphasis as a clickable node', () => {
    const blocks = parseMarkdown('**[文档](https://example.com)**');
    const content = blocks[0]?.kind === 'paragraph' ? blocks[0].content : [];
    expect(inlineKinds(content)).toEqual(['strong']);
    const strong = content[0];
    expect(strong?.kind === 'strong' ? inlineKinds(strong.content) : []).toEqual(['link']);
    expect(strong?.kind === 'strong' && strong.content[0]?.kind === 'link' ? strong.content[0].href : '').toBe(
      'https://example.com',
    );
  });

  it('keeps fenced code and later paragraphs inside list items', () => {
    const blocks = parseMarkdown('1. 步骤\n\n   ```js\n   run()\n   ```\n\n   第二段解释\n\n2. 下一步');
    const list = blocks[0];
    expect(list).toMatchObject({ kind: 'list', ordered: true });
    const items = list?.kind === 'list' ? list.items : [];
    expect(items.map((item) => inlineText(item.content))).toEqual(['步骤\nrun()\n第二段解释', '下一步']);
    expect(items[0]?.content.some((node) => node.kind === 'code' && node.text === 'run()')).toBe(true);
  });

  it('keeps every block inside quotes with separators', () => {
    const blocks = parseMarkdown('> 第一段\n>\n> ```js\n> x()\n> ```\n>\n> 第二段');
    const quote = blocks[0];
    expect(quote?.kind).toBe('quote');
    expect(quote?.kind === 'quote' ? inlineText(quote.content) : '').toBe('第一段\nx()\n第二段');
  });

  it('degrades images, html, tables and unknown marks to plain text without rendering tags', () => {
    const blocks = parseMarkdown('![替代文本](image.png)\n\n<b>raw</b>\n\n<div>块级 HTML</div>\n\n| a | b |\n| - | - |\n| 1 | 2 |\n\n???');
    expect(kinds(blocks).every((kind) => kind === 'paragraph')).toBe(true);
    const text = blocks.map((block) => (block.kind === 'paragraph' ? inlineText(block.content) : '')).join('\n');
    expect(text).toContain('替代文本');
    expect(text).not.toContain('<b>');
    expect(text).not.toContain('image.png');
    expect(text).toContain('a');
    expect(text).toContain('块级 HTML');
  });

  it('keeps hard line breaks as plain text', () => {
    const blocks = parseMarkdown('第一行  \n第二行');
    expect(blocks[0]?.kind === 'paragraph' ? inlineText(blocks[0].content) : '').toContain('第二行');
  });

  it('keeps an unclosed code fence as a code block without throwing', () => {
    const blocks = parseMarkdown('```js\nconst open = true;');
    expect(blocks).toEqual([{ kind: 'code', language: 'js', code: 'const open = true;' }]);
  });

  it('handles garbage markdown, empty links and long single lines safely', () => {
    const blocks = parseMarkdown(`[]() ${'x'.repeat(10_000)} **`);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.kind).toBe('paragraph');
    expect(blocks[0]?.kind === 'paragraph' ? inlineText(blocks[0].content).length : 0).toBeGreaterThan(9_000);
  });

  it('flattens nested list items with their indent level', () => {
    const blocks = parseMarkdown('- 顶层\n  - 子项');
    const list = blocks[0];
    expect(list).toMatchObject({ kind: 'list', ordered: false });
    expect(list?.kind === 'list' ? list.items.map((item) => item.indent) : []).toEqual([0, 1]);
    expect(list?.kind === 'list' ? inlineText(list.items[1]?.content ?? []) : '').toBe('子项');
  });

  it('starts ordered lists at their markdown start number', () => {
    const blocks = parseMarkdown('5. 五\n6. 六');
    expect(blocks[0]).toMatchObject({ kind: 'list', ordered: true, start: 5 });
  });

  it('flattens pathological nesting into safe content without throwing', () => {
    const deep = Array.from({ length: 2_000 }, (_, index) => ' '.repeat(index * 2) + '- x').join('\n');
    const blocks = parseMarkdown(deep);
    expect(blocks.length).toBeGreaterThan(0);
    expect(kinds(blocks).every((kind) => ['list', 'paragraph'].includes(kind))).toBe(true);
  });

  it('keeps every produced node inside the closed vocabularies', () => {
    const blocks = parseMarkdown('# H\n\n**b** _i_ `c` [l](https://e.com)\n\n- x\n\n> q\n\n---\n\n```\ncode\n```\n\n![a](i.png) <u>t</u> |x|\n');
    const blockKinds = new Set(kinds(blocks));
    const inline = new Set(
      blocks.flatMap((block) =>
        block.kind === 'list'
          ? block.items.flatMap((item) => inlineKinds(item.content))
          : block.kind === 'code' || block.kind === 'divider'
            ? []
            : inlineKinds(block.content),
      ),
    );
    expect([...blockKinds].every((kind) => ['heading', 'paragraph', 'list', 'quote', 'code', 'divider'].includes(kind))).toBe(true);
    expect([...inline].every((kind) => ['text', 'strong', 'emphasis', 'code', 'link'].includes(kind))).toBe(true);
  });
});
