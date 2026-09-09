import { describe, expect, test } from 'bun:test';

import { thinkingParagraphs } from '../thinking-paragraphs';

describe('thinkingParagraphs', () => {
  test('修复症状：思考段间距过大——空行分段不再保留为空段，间距交由视图控制', () => {
    expect(thinkingParagraphs('第一段\n\n第二段\n\n\n第三段')).toEqual(['第一段', '第二段', '第三段']);
  });

  test('段内单换行保留原貌', () => {
    expect(thinkingParagraphs('段内\n仍有单换行\n\n下一段')).toEqual(['段内\n仍有单换行', '下一段']);
  });

  test('段首尾空白剥除', () => {
    expect(thinkingParagraphs('  首尾空白  \n\n\t制表  ')).toEqual(['首尾空白', '制表']);
  });

  test('垃圾输入降级为空数组', () => {
    expect(thinkingParagraphs('')).toEqual([]);
    expect(thinkingParagraphs('\n \n\n  \n')).toEqual([]);
  });
});
