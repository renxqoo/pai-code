import { describe, expect, test } from 'bun:test';

import { highlightFileHtml } from '../shiki-core';

/** 真实 shiki 引擎（JS regex）：文件 pane 的双主题 HTML 高亮核心。 */
describe('highlightFileHtml', () => {
  test('收录语言产出双主题 HTML（--shiki-dark 变量 + shiki 类名）', async () => {
    const html = await highlightFileHtml('const x = 1;', 'ts');
    expect(html).toContain('shiki');
    expect(html).toContain('--shiki-dark');
    expect(html).toContain('const');
  });

  test('纯文本/未收录语言返回 null（调用方渲染纯文本 pre）', async () => {
    expect(await highlightFileHtml('hello', 'text')).toBeNull();
    expect(await highlightFileHtml('hello', 'unknown-lang-xyz')).toBeNull();
    expect(await highlightFileHtml('', 'ts')).not.toBeNull();
  });

  test('同输入命中缓存（第二次同步相等）', async () => {
    const first = await highlightFileHtml('cache-me();', 'js');
    const second = await highlightFileHtml('cache-me();', 'js');
    expect(second).toBe(first);
  });
});
