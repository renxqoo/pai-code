import { describe, expect, test } from 'bun:test';

import { MARKDOWN_FOOTNOTE_MARKER, nextMarkdownStreamCache, type MarkdownStreamCache } from '../markdown-stream-cache';

/**
 * 块冻结缓存的正确性核心（T37）：增量切尾与全量切分在任意 delta 切点下逐块等价。
 * 等价 ⇒ 渲染层各块独立渲染的产物与上游单实例逐块渲染完全一致（上游 memo 本就
 * 按块独立渲染）。1 字符步进 = 对语料穷举所有可能切点。
 */

const CORPUS: ReadonlyArray<{ name: string; text: string }> = [
  { name: '段落与空行', text: '第一段。\n\n第二段，**加粗**与 `code`。\n\n第三段。' },
  { name: '紧凑列表', text: '- 甲\n- 乙\n- 丙' },
  { name: '松散列表', text: '- 甲\n\n- 乙\n\n- 丙' },
  { name: '嵌套列表', text: '- 甲\n  - 甲一\n  - 甲二\n- 乙' },
  { name: '有序列表续写', text: '1. 一\n2. 二\n3. 三' },
  { name: 'GFM 表格', text: '| A | B |\n| --- | --- |\n| 1 | 2 |\n| 3 | 4 |' },
  { name: '围栏代码闭合', text: '前文\n\n```ts\nconst a = 1;\n```\n\n后文' },
  { name: '围栏代码未闭合（流式中）', text: '前文\n\n```ts\nconst a = 1;\n' },
  { name: '围栏内含空行（冻结边界不得落入围栏内部）', text: '前文\n\n```ts\nconst a = 1;\n\nconst b = 2;\n```\n\n后文' },
  { name: '波浪围栏', text: '~~~sh\necho hi\n~~~\n\n尾段' },
  { name: 'setext 标题跨行', text: '标题行\n---\n\n正文' },
  { name: 'ATX 标题', text: '## 章\n\n### 节\n\n正文' },
  { name: '块引用', text: '> 引用一\n> 引用二\n\n正文' },
  { name: '分隔线', text: '上文\n\n---\n\n下文' },
  { name: '$$ 公式块', text: '前文\n\n$$\nE = mc^2\n$$\n\n后文' },
  { name: '行内 HTML', text: '<div class="x">块内</div>\n\n正文' },
  { name: '行尾断行', text: '行一\n行二\n行三' },
  { name: '删除线与任务列表', text: '- [x] 完成\n- [ ] 待办\n\n~~删除~~' },
  { name: '奇数 $$ 跨空行（上游 ka 合并路径）', text: 'A$$\n\nB$$\n\nC' },
  { name: '未闭合 HTML（上游 s 栈吸收合并）', text: '<div>\nfoo\n\nbar' },
  { name: '链接引用定义', text: '见 [文献][ref]。\n\n[ref]: https://example.com\n\n正文。' },
  { name: '缩进代码', text: '正文\n\n    indented code\n    line2\n\n尾文' },
  {
    name: '混合长文',
    text: [
      '# 标题',
      '',
      '导语段落，含 **加粗**、`行内码` 与 [链接](https://example.com)。',
      '',
      '```python',
      'def main():',
      '    print("hello")',
      '```',
      '',
      '- 要点一',
      '- 要点二',
      '',
      '| 列 | 值 |',
      '| --- | --- |',
      '| a | 1 |',
      '',
      '> 引用段',
      '',
      '收尾段落。',
    ].join('\n'),
  },
];

function fullCache(text: string): MarkdownStreamCache {
  return nextMarkdownStreamCache(null, text);
}

function feed(text: string, step: number, jitter = 0): MarkdownStreamCache {
  let cache: MarkdownStreamCache | null = null;
  let len = 0;
  let tick = 0;
  while (len < text.length) {
    len = Math.min(text.length, len + step + (tick % 2 === 1 ? jitter : 0));
    tick += 1;
    cache = nextMarkdownStreamCache(cache, text.slice(0, len));
  }
  cache ??= fullCache(text);
  return nextMarkdownStreamCache(cache, text);
}

function assertEquivalence(text: string, step: number, jitter = 0): void {
  const full = fullCache(text);
  const incremental = feed(text, step, jitter);
  // 冻结区粒度不同（增量多次冻结 vs 全量一次冻结），载荷不变量：
  // 冻结文本拼接相同 + 实时尾区相同（决定后续渲染完全一致）
  expect(incremental.frozen.join('')).toBe(full.frozen.join(''));
  expect(incremental.tail).toBe(full.tail);
  expect(incremental.footnote).toBe(full.footnote);
}

describe('块冻结缓存：增量切尾 ≡ 全量切分（边界等价性质）', () => {
  for (const { name, text } of CORPUS) {
    test(`${name}：1 字符步进（穷举切点）`, () => {
      assertEquivalence(text, 1);
    });
  }

  test('混合长文：7/13/31/131 字符步进与奇偶抖动', () => {
    const mixed = CORPUS[CORPUS.length - 1]?.text ?? '';
    for (const step of [7, 13, 31, 131]) {
      assertEquivalence(mixed, step, 3);
    }
  });

  test('跨块拼接恒等：frozen.concat(tail) === 全文', () => {
    for (const { text } of CORPUS) {
      const cache = feed(text, 5);
      expect([...cache.frozen, cache.tail].join('')).toBe(text);
    }
  });

  test('代理对跨 delta 边界切半：不抛错且拼接恒等', () => {
    const text = 'emoji 🄰🄱🄲 与中日汉字混排。\n\n第二段🇨🇳旗帜。\n\n收尾。';
    const cache = feed(text, 1);
    expect([...cache.frozen, cache.tail].join('')).toBe(text);
  });

  test('CRLF 行尾：单块回退（零冻结、零词法）且与全量路径一致', () => {
    const text = '第一段。\r\n\r\n第二段。\r\n\r\n第三段。';
    const full = fullCache(text);
    expect(full.crlf).toBe(true);
    expect(full.frozen).toEqual([]);
    expect(full.tail).toBe(text);
    const incremental = feed(text, 3);
    expect(incremental.frozen.join('')).toBe(full.frozen.join(''));
    expect(incremental.tail).toBe(full.tail);
    expect(incremental.crlf).toBe(true);
  });
});

describe('块冻结缓存：上游耦合守卫', () => {
  test('脚注快速路径等价：本地判据命中 ⟺ 上游整文单块（判据漂移即红）', async () => {
    const { parseMarkdownIntoBlocks } = await import('streamdown');
    // 语料全部是「无快速路径时必切多块」的形态：上游单块 ⟺ 走了脚注快速路径
    const footnoteSamples = ['引用[^1]。\n\n正文。', '[^a-b]: 定义\n\n正文', 'x[^long_id-200]y\n\nz'];
    const plainSamples = ['甲\n\n乙\n\n丙', '```ts\ncode\n```\n\n尾段'];
    for (const sample of footnoteSamples) {
      expect(MARKDOWN_FOOTNOTE_MARKER.test(sample)).toBe(true);
      expect(parseMarkdownIntoBlocks(sample)).toEqual([sample]);
    }
    for (const sample of plainSamples) {
      expect(MARKDOWN_FOOTNOTE_MARKER.test(sample)).toBe(false);
      expect(parseMarkdownIntoBlocks(sample).length).toBeGreaterThan(1);
    }
  });
});

describe('块冻结缓存：脚注回退', () => {
  const footnoteText = '正文引用[^1]。\n\n[^1]: 定义。';

  test('命中 → 整文单块（frozen 恒空、tail=全文），增量到达同样回退', () => {
    const full = nextMarkdownStreamCache(null, footnoteText);
    expect(full.footnote).toBe(true);
    expect(full.frozen).toEqual([]);
    expect(full.tail).toBe(footnoteText);

    // 引用先到（无脚注标记）、定义后到：定义 delta 命中闩锁 → 整体回退单块
    let cache: MarkdownStreamCache | null = null;
    cache = nextMarkdownStreamCache(cache, '正文引用[^1]。\n\n');
    expect(cache.footnote).toBe(true); // 引用形态即命中（对齐上游 ba 正则）
    cache = nextMarkdownStreamCache(cache, footnoteText);
    expect(cache.footnote).toBe(true);
    expect(cache.frozen).toEqual([]);
  });

  test('非前缀替换去除脚注 → 恢复分块', () => {
    const withFootnote = nextMarkdownStreamCache(null, footnoteText);
    const replaced = nextMarkdownStreamCache(withFootnote, '普通多段\n\n第二段\n\n第三段');
    expect(replaced.footnote).toBe(false);
    expect(replaced.frozen.length).toBeGreaterThan(0);
  });
});

describe('块冻结缓存：math/mermaid 闩锁', () => {
  test('标记跨 delta 边界仍命中（"$"+"$" / "```mer"+"maid"）', () => {
    let cache: MarkdownStreamCache | null = null;
    cache = nextMarkdownStreamCache(cache, '公式 $');
    expect(cache?.math).toBe(false);
    cache = nextMarkdownStreamCache(cache, '公式 $$');
    expect(cache?.math).toBe(true);

    let mermaid: MarkdownStreamCache | null = null;
    mermaid = nextMarkdownStreamCache(mermaid, '图示\n\n```mer');
    expect(mermaid?.mermaid).toBe(false);
    mermaid = nextMarkdownStreamCache(mermaid, '图示\n\n```mermaid');
    expect(mermaid?.mermaid).toBe(true);
  });

  test('闩锁单调（命中后保持）；非前缀替换全量重扫复位', () => {
    let cache: MarkdownStreamCache | null = null;
    cache = nextMarkdownStreamCache(cache, '含 $$ 公式\n\n第二段');
    expect(cache?.math).toBe(true);
    cache = nextMarkdownStreamCache(cache, '含 $$ 公式\n\n第二段续');
    expect(cache?.math).toBe(true);
    const replaced = nextMarkdownStreamCache(cache, '全新文本，无公式\n\n无围栏');
    expect(replaced.math).toBe(false);
    expect(replaced.mermaid).toBe(false);
  });
});

describe('块冻结缓存：替换重建与幂等', () => {
  test('同 text 返回同引用（下游 memo 命中前提）', () => {
    const first = nextMarkdownStreamCache(null, '一段\n\n二段');
    const second = nextMarkdownStreamCache(first, '一段\n\n二段');
    expect(second).toBe(first);
  });

  test('非前缀变化（messageFinal 权威替换口径）全量重切', () => {
    let cache: MarkdownStreamCache | null = null;
    cache = nextMarkdownStreamCache(cache, '流式前半');
    const replaced = nextMarkdownStreamCache(cache, '权威正文甲\n\n权威正文乙');
    expect(replaced.frozen).toEqual(['权威正文甲\n\n']);
    expect(replaced.tail).toBe('权威正文乙');
  });

  test('空文本：frozen 空、tail 空', () => {
    const cache = nextMarkdownStreamCache(null, '');
    expect(cache.frozen).toEqual([]);
    expect(cache.tail).toBe('');
  });

  test('流式截断回退（文本变短非前缀）全量重切', () => {
    let cache: MarkdownStreamCache | null = null;
    cache = nextMarkdownStreamCache(cache, 'AAAA\n\nBBBB\n\nCCCC');
    const shrunk = nextMarkdownStreamCache(cache, 'AAAA\n\nBB');
    expect([...shrunk.frozen, shrunk.tail].join('')).toBe('AAAA\n\nBB');
  });
});
