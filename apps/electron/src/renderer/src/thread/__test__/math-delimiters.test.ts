import { describe, expect, test } from 'bun:test';

import { hasMathDelimiter } from '../math-delimiters';
import { hasMermaidFence } from '../mermaid-fence';

describe('hasMathDelimiter', () => {
  test('$$ 定界（行内或块级）判为需要 math 插件', () => {
    expect(hasMathDelimiter('质能方程 $$E=mc^2$$ 很有名')).toBe(true);
    expect(hasMathDelimiter('$$\n\\int_0^1 x\\,dx\n$$')).toBe(true);
  });

  test('单 $（金额、价格等普通文案）不触发 math 插件', () => {
    expect(hasMathDelimiter('it costs $5 and $10')).toBe(false);
    expect(hasMathDelimiter('$E=mc^2$')).toBe(false);
  });

  test('无定界符与空文本为 false', () => {
    expect(hasMathDelimiter('plain code: ```ts\nconst a = 1;\n```')).toBe(false);
    expect(hasMathDelimiter('')).toBe(false);
  });
});

describe('hasMermaidFence', () => {
  test('mermaid 围栏判为需要 mermaid 插件', () => {
    expect(hasMermaidFence('```mermaid\nflowchart TD\nA-->B\n```')).toBe(true);
    expect(hasMermaidFence('~~~mermaid\nflowchart LR\n~~~')).toBe(true);
    expect(hasMermaidFence('```mermaid')).toBe(true);
  });

  test('普通语言围栏与文本不误报', () => {
    expect(hasMermaidFence('```ts\nconst a = 1;\n```')).toBe(false);
    expect(hasMermaidFence('mermaid 是个图表工具')).toBe(false);
    expect(hasMermaidFence('```mermaidish\nnot a diagram\n```')).toBe(false);
    expect(hasMermaidFence('')).toBe(false);
  });
});
