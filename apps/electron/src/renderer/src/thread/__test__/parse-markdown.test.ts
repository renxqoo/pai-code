import { describe, expect, test } from 'bun:test';

import { parseInlineSegments, parseMarkdown, safeLinkHref } from '../parse-markdown';

describe('parseInlineSegments', () => {
  test('纯文本原样返回', () => {
    expect(parseInlineSegments('hello world')).toEqual([{ kind: 'text', value: 'hello world' }]);
  });

  test('行内代码、粗体、斜体、链接混排', () => {
    const segments = parseInlineSegments('run `bun test` with **care** and *speed*, see [docs](https://example.com/a)');
    expect(segments).toEqual([
      { kind: 'text', value: 'run ' },
      { kind: 'code', value: 'bun test' },
      { kind: 'text', value: ' with ' },
      { kind: 'strong', value: 'care' },
      { kind: 'text', value: ' and ' },
      { kind: 'emphasis', value: 'speed' },
      { kind: 'text', value: ', see ' },
      { kind: 'link', value: 'docs', href: 'https://example.com/a' },
    ]);
  });

  test('非 http(s) 链接不产出链接段，原文保留为纯文本', () => {
    const raw = 'click [x](javascript:alert(1)) here';
    const segments = parseInlineSegments(raw);
    expect(segments.every((segment) => segment.kind !== 'link')).toBe(true);
    const joined = segments
      .map((segment) => (segment.kind === 'text' ? segment.value : ''))
      .join('');
    expect(joined).toBe(raw);
    expect(safeLinkHref('file:///etc/passwd')).toBeNull();
    expect(safeLinkHref('https://ok.example/')).toBe('https://ok.example/');
  });
});

describe('parseMarkdown', () => {
  test('空行分隔的多段落', () => {
    const blocks = parseMarkdown('first para\n\nsecond para');
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toEqual({ kind: 'paragraph', segments: [{ kind: 'text', value: 'first para' }] });
    expect(blocks[1]).toEqual({ kind: 'paragraph', segments: [{ kind: 'text', value: 'second para' }] });
  });

  test('段落内换行合并为同一行', () => {
    const blocks = parseMarkdown('line one\nline two');
    expect(blocks).toEqual([
      { kind: 'paragraph', segments: [{ kind: 'text', value: 'line one line two' }] },
    ]);
  });

  test('fenced 代码块保留语言与内容', () => {
    const blocks = parseMarkdown('before\n\n```ts\nconst a = 1;\nconst b = 2;\n```\n\nafter');
    expect(blocks[1]).toEqual({ kind: 'code', lang: 'ts', code: 'const a = 1;\nconst b = 2;' });
    expect(blocks).toHaveLength(3);
  });

  test('未闭合代码块取到文末，不丢内容', () => {
    const blocks = parseMarkdown('```sh\necho hi');
    expect(blocks).toEqual([{ kind: 'code', lang: 'sh', code: 'echo hi' }]);
  });

  test('标题层级 1-4，井号后无文本不误判', () => {
    const blocks = parseMarkdown('## Title\n#### Deep\n#no-space stays paragraph');
    expect(blocks[0]).toEqual({ kind: 'heading', level: 2, text: 'Title' });
    expect(blocks[1]).toEqual({ kind: 'heading', level: 4, text: 'Deep' });
    expect(blocks[2].kind).toBe('paragraph');
  });

  test('无序与有序列表各自聚块，混合时断开', () => {
    const blocks = parseMarkdown('- one\n- two\n\n1. first\n2. second');
    expect(blocks[0]).toEqual({
      kind: 'list',
      ordered: false,
      items: [
        [{ kind: 'text', value: 'one' }],
        [{ kind: 'text', value: 'two' }],
      ],
    });
    expect(blocks[1]).toEqual({
      kind: 'list',
      ordered: true,
      items: [
        [{ kind: 'text', value: 'first' }],
        [{ kind: 'text', value: 'second' }],
      ],
    });
  });

  test('列表项支持行内标记', () => {
    const blocks = parseMarkdown('- run `bun test`\n- see [guide](https://example.com)');
    const list = blocks[0];
    if (list.kind !== 'list') throw new Error('expected list');
    expect(list.items[0]).toEqual([{ kind: 'text', value: 'run ' }, { kind: 'code', value: 'bun test' }]);
    expect(list.items[1]).toEqual([
      { kind: 'text', value: 'see ' },
      { kind: 'link', value: 'guide', href: 'https://example.com' },
    ]);
  });

  test('空输入返回空块数组', () => {
    expect(parseMarkdown('')).toEqual([]);
    expect(parseMarkdown('\n\n  \n')).toEqual([]);
  });
});
