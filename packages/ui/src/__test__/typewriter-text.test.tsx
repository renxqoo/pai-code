import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { TypewriterText, typewriterTail } from '../typewriter-text';

describe('typewriterTail 展示窗口', () => {
  test('光标钳到文本末尾，超窗只留尾部片段', () => {
    expect(typewriterTail('abcdef', 3, 10)).toBe('abc');
    expect(typewriterTail('abcdef', 100, 4)).toBe('cdef');
    expect(typewriterTail('abcdef', 6, 6)).toBe('abcdef');
  });

  test('垃圾输入降级：空文本与非法窗口不越界', () => {
    expect(typewriterTail('', 5, 10)).toBe('');
    expect(typewriterTail('abc', 2, 0)).toBe('b');
    expect(typewriterTail('abc', -1, 10)).toBe('');
  });
});

describe('TypewriterText 静态渲染', () => {
  test('静止态：单行截断呈现压平文本', () => {
    const html = renderToStaticMarkup(<TypewriterText text={'一行放得下的\n思考预览'} active={false} />);
    expect(html).toContain('truncate');
    expect(html).toContain('一行放得下的 思考预览');
    expect(html).not.toContain('sr-only');
  });

  test('激活态：展示尾部片段（无光标），读屏取稳定尾部替身', () => {
    const long = `${'字'.repeat(300)}最新推理内容`;
    const html = renderToStaticMarkup(<TypewriterText text={long} active className="text-meta-faint" />);
    expect(html).toContain('overflow-hidden');
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('最新推理内容');
    expect(html).toContain('text-meta-faint');
    expect(html).not.toContain('truncate');
  });

  test('空文本：渲染空壳，不崩溃', () => {
    const html = renderToStaticMarkup(<TypewriterText text="" active />);
    expect(html).toContain('sr-only');
  });
});
