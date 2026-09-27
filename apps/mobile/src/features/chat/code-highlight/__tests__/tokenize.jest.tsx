import * as React from 'react';
import { act, render } from '@testing-library/react-native';
import { describe, expect, it } from '@jest/globals';

import { HighlightedCode } from '@/features/chat/code-highlight/highlighted-code';
import { tokenizeCode } from '@/features/chat/code-highlight/tokenize';

describe('tokenizeCode（T56 M4：shiki 词法）', () => {
  it('typescript 高亮出带色 token（真实 shiki 引擎）', async () => {
    const lines = await tokenizeCode('const answer: number = 42;', 'ts', 'github-light');
    expect(lines).not.toBeNull();
    const flat = (lines ?? []).flat();
    expect(flat.map((token) => token.text).join('')).toBe('const answer: number = 42;');
    expect(flat.some((token) => token.color !== null)).toBe(true);
  });

  it('浅/深主题各自出 token（随 isDark 切换）', async () => {
    const light = await tokenizeCode('const a = 1;', 'typescript', 'github-light');
    const dark = await tokenizeCode('const a = 1;', 'typescript', 'github-dark');
    expect(light).not.toBeNull();
    expect(dark).not.toBeNull();
    expect((light ?? [])[0]?.[0]?.color).not.toBe((dark ?? [])[0]?.[0]?.color);
  });

  it('缓存命中同一结果（不重复词法）', async () => {
    const first = await tokenizeCode('let cached = true;', 'typescript', 'github-light');
    const second = await tokenizeCode('let cached = true;', 'typescript', 'github-light');
    expect(second).toBe(first);
  });

  it('降级矩阵：语言不识别/空语言/超长 → null（退等宽纯文本）', async () => {
    expect(await tokenizeCode('x', 'brainfuck', 'github-light')).toBeNull();
    expect(await tokenizeCode('x', undefined, 'github-light')).toBeNull();
    expect(await tokenizeCode('x', '  ', 'github-light')).toBeNull();
    expect(await tokenizeCode('x'.repeat(20_001), 'typescript', 'github-light')).toBeNull();
  });

  it('垃圾输入不抛且不丢文本（shiki 容错，词法照出）', async () => {
    const lines = await tokenizeCode(' � not json', 'json', 'github-light');
    expect(lines).not.toBeNull();
    expect((lines ?? []).flat().map((token) => token.text).join('')).toBe(' � not json');
  });
});

describe('HighlightedCode（T56 M4：渲染）', () => {
  const collect = (node: unknown): string => {
    if (typeof node === 'string') return node;
    const item = node as { children?: unknown };
    if (Array.isArray(item.children)) return item.children.map(collect).join('');
    return '';
  };

  it('高亮就绪后逐 token 上色、全文不丢；降级时与纯文本逐字节一致', async () => {
    const view = await render(<HighlightedCode code={'const hi = 1;'} language="typescript" />);
    await act(async () => {});
    expect(collect(view.toJSON())).toBe('const hi = 1;');
    expect(JSON.stringify(view.toJSON())).toContain('color');

    const plain = await render(<HighlightedCode code={'raw text'} language="brainfuck" />);
    await act(async () => {});
    expect(plain.getByText('raw text')).toBeTruthy();
  });

  it('空行不丢（症状：含空行代码显示/复制少行，行数徽标对不上）', async () => {
    const view = await render(<HighlightedCode code={'a\n\nb'} language="typescript" />);
    await act(async () => {});
    expect(collect(view.toJSON())).toBe('a\n\nb');
  });

  it('换码不闪旧 token（症状：切换 code 后短暂渲染上一份高亮）', async () => {
    const view = await render(<HighlightedCode code={'const first = 1;'} language="typescript" />);
    await act(async () => {});
    expect(collect(view.toJSON())).toBe('const first = 1;');
    await view.rerender(<HighlightedCode code={'const second = 2;'} language="typescript" />);
    // 提交后、高亮就绪前：立即是新码纯文本，绝不残留旧 token
    expect(collect(view.toJSON())).toBe('const second = 2;');
    await act(async () => {});
    expect(collect(view.toJSON())).toBe('const second = 2;');
  });
});
