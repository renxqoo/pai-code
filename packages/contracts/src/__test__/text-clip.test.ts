import { describe, expect, test } from 'bun:test';

import { clipAtWord, clipText } from '../text-clip';

describe('clipText 截断的唯一口径', () => {
  test('未超限原样返回（不加工、不加省略号）', () => {
    expect(clipText('bun test', 120)).toBe('bun test');
    expect(clipText('', 120)).toBe('');
  });

  test('超限加省略号，且结果长度不超过上限（省略号占一位）', () => {
    const out = clipText('x'.repeat(200), 120);
    expect(out.endsWith('…')).toBe(true);
    expect(out.length).toBe(120);
  });

  test('症状回归：不得劈开代理对（曾硬切出行尾替换符 �）', () => {
    // 精确断言，不用 includes('…')——slice 产出的是孤立代理项 U+D83C 而非
    // 替换符 U+FFFD，那样的断言恒真（变异测试实证：删掉保护仍全绿）
    const input = `${'x'.repeat(118)}${'🎉'.repeat(40)}`;
    const out = clipText(input, 120);
    expect(out.length).toBeLessThanOrEqual(120);
    // 末位不是孤立高位代理：倒着数，完整 emoji 是两个码元
    const lastCode = out.charCodeAt(out.length - 2);
    expect(lastCode).toBeLessThan(0xd800);
    // 全文没有孤立代理项
    for (let i = 0; i < out.length; i += 1) {
      const code = out.charCodeAt(i);
      if (code >= 0xd800 && code <= 0xdbff) {
        // 合法的高位代理后面必须紧跟低位代理
        expect(out.charCodeAt(i + 1)).toBeGreaterThan(0xdc00);
        expect(out.charCodeAt(i + 1)).toBeLessThan(0xe000);
        i += 1;
      }
    }
  });

  test('非法上限降级为空串（上限是非法输入，不该返回整串或半个串）', () => {
    expect(clipText('abc', 0)).toBe('');
    expect(clipText('abc', -5)).toBe('');
    expect(clipText('abc', 1)).toBe('…');
  });

  test('纯 ASCII 截断位置精确（前 max-1 个字符 + 省略号）', () => {
    expect(clipText('abcdefghij', 5)).toBe('abcd…');
  });
});

describe('clipAtWord 按词边界截断', () => {
  test('切点附近有空格：回退到词边界，不劈文件名', () => {
    const text = 'sed -n 1,60p apps/mobile/src/chat/timeline-list.tsx and also some trailing words here';
    const out = clipAtWord(text, 60);
    expect(out.endsWith('…')).toBe(true);
    expect(out.length).toBeLessThanOrEqual(60);
    // 截断点是空格：head 之后原文的下一个字符不是空格（说明没落在词中间）
    const head = out.slice(0, -1);
    expect(text.startsWith(head)).toBe(true);
    expect(text[head.length]).not.toBe(' ');
  });

  test('无词边界可退时按硬切（保内容量优先于「词完整」）', () => {
    // 一个空格都没有的长路径：硬切到上限，而不是退化成只剩首词
    const out = clipAtWord('/very/long/path/'.repeat(20), 60);
    expect(out.length).toBe(60);
    expect(out.endsWith('…')).toBe(true);
  });

  test('无空格超长串：硬切（不假装做到词边界——CJK 与长 token 本就没有）', () => {
    const out = clipAtWord('修'.repeat(200), 30);
    expect(out.length).toBe(30);
    expect(out.endsWith('…')).toBe(true);
  });

  test('切点回退不到一半时按硬切（回退反而丢更多内容）', () => {
    // 第一个词 55 字，第二段紧跟：回退到词边界会只剩 55 字，硬切能到 99
    const out = clipAtWord(`${'a'.repeat(55)} ${'b'.repeat(80)}`, 100);
    expect(out.length).toBe(100);
  });

  test('症状回归：不得出现截断悬崖（121 字不应只剩 61 字）', () => {
    // 旧实现回退条件是 lastSpace > budget/2，导致 119 全显、121 只剩 61
    expect(clipAtWord('b'.repeat(121), 120).length).toBe(120);
    expect(clipAtWord(`${'a'.repeat(60)} ${'b'.repeat(58)}`, 120).length).toBe(119);
  });

  test('代理对保护优先于词边界：emoji 完整保留', () => {
    const out = clipAtWord(`${'x'.repeat(115)} 🎉 tail`, 120);
    expect(out.endsWith('…')).toBe(true);
    // 完整 emoji = 高位 + 低位两个码元；孤立代理项的判据是「高位后面不是低位」
    for (let i = 0; i < out.length - 1; i += 1) {
      const code = out.charCodeAt(i);
      if (code >= 0xd800 && code <= 0xdbff) {
        const next = out.charCodeAt(i + 1);
        expect(next >= 0xdc00 && next <= 0xdfff).toBe(true);
        i += 1;
      }
    }
  });

  test('未超限原样返回', () => {
    expect(clipAtWord('bun test', 120)).toBe('bun test');
  });
});
