import { describe, expect, test } from 'bun:test';

import { editHunksField, editHunksOf } from '../edit-hunks';

/** 孤立高位代理项计数：高位码元后面不跟低位代理 = 半个字符。 */
function loneHighSurrogates(text: string): number {
  let count = 0;
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = text.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) i += 1;
      else count += 1;
    }
  }
  return count;
}

const ARGS = {
  path: 'src/a.ts',
  edits: [
    { oldText: 'const a = 1;', newText: 'const a = 2;' },
    { oldText: 'old line\nkeep', newText: 'new line\nkeep' },
  ],
};

describe('editHunksOf：edit 工具参数 → 补丁片段', () => {
  test('path 逐片段携带（渲染层按 path 归并同一文件的多次编辑）', () => {
    const [first] = editHunksOf('edit', ARGS);
    expect(first?.path).toBe('src/a.ts');
  });

  test('缺 path 降级为空串（归并时视作未知路径，不与真实文件合并）', () => {
    const [first] = editHunksOf('edit', { edits: [{ oldText: 'a', newText: 'b' }] });
    expect(first?.path).toBe('');
  });

  test('正常形状：逐条映射为原文/新文对', () => {
    expect(editHunksOf('edit', ARGS)).toEqual([
      { oldText: 'const a = 1;', newText: 'const a = 2;', path: 'src/a.ts' },
      { oldText: 'old line\nkeep', newText: 'new line\nkeep', path: 'src/a.ts' },
    ]);
  });

  test('工具名大小写不敏感（协议侧小写，扩展出现过 Edit）', () => {
    expect(editHunksOf('Edit', ARGS)).toHaveLength(2);
  });

  test('非 edit 工具不产出片段（write 是整文件重写、无基线可比）', () => {
    expect(editHunksOf('write', { path: 'a', content: 'x' })).toEqual([]);
    expect(editHunksOf('read', { path: 'a' })).toEqual([]);
    expect(editHunksOf('bash', { command: 'ls' })).toEqual([]);
  });

  test('垃圾形状降级空数组，不抛不崩', () => {
    expect(editHunksOf('edit', {})).toEqual([]);
    expect(editHunksOf('edit', { edits: 'not-array' })).toEqual([]);
    expect(editHunksOf('edit', { edits: [null, 3, 'x'] })).toEqual([]);
    expect(editHunksOf('edit', { edits: [{ oldText: 'a' }, { newText: 'b' }] })).toEqual([]);
    expect(editHunksOf('edit', { edits: [{ oldText: 1, newText: 2 }] })).toEqual([]);
  });

  test('原文与新文相同的片段丢弃（没改动的配对不是 diff 面）', () => {
    expect(editHunksOf('edit', { edits: [{ oldText: 'same', newText: 'same' }] })).toEqual([]);
  });

  test('片段数有上界：超量只取前八条（参数 edits 数组无界，展示面需封顶）', () => {
    const many = { edits: Array.from({ length: 20 }, (_, i) => ({ oldText: `o${i}`, newText: `n${i}` })) };
    expect(editHunksOf('edit', many)).toHaveLength(8);
  });

  test('超长片段截断（模型违规大段重写）：有省略号、且不劈代理对', () => {
    const long = 'x'.repeat(5000);
    const [hunk] = editHunksOf('edit', { edits: [{ oldText: long, newText: 'n' }] });
    expect(hunk?.oldText.length).toBe(2000);
    // 静默截断会让 diff 面的红绿行数骗人——必须出省略号
    expect(hunk?.oldText.endsWith('…')).toBe(true);

    // 代理对边界：精确断言「无孤立代理项」——不用 includes('\uFFFD')，
    // 那恒真（slice 产出的是孤立代理项 U+D83C，不是替换符），删掉保护也照绿
    const emoji = '😀'.repeat(1200);
    const [emojiHunk] = editHunksOf('edit', { edits: [{ oldText: emoji, newText: 'n' }] });
    expect(emojiHunk?.oldText.length).toBeLessThanOrEqual(2000);
    expect(loneHighSurrogates(emojiHunk?.oldText ?? '')).toBe(0);
  });
});

describe('editHunksField：wire 字段（空则不携带）', () => {
  test('有片段时携带 editHunks 字段', () => {
    expect(editHunksField('edit', ARGS)).toEqual({ editHunks: editHunksOf('edit', ARGS) });
  });

  test('无片段时返回空对象（字段在 wire 上缺席，与 subagents 同一约定）', () => {
    expect(editHunksField('read', { path: 'a' })).toEqual({});
    expect(editHunksField('edit', { edits: [] })).toEqual({});
  });
});
