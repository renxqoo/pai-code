import { describe, expect, test } from 'bun:test';

import { autoTitleCandidateOf } from '../auto-title';

describe('autoTitleCandidateOf：自动命名标题语料判定', () => {
  test('普通消息：空白折叠、截断 48 字符', () => {
    expect(autoTitleCandidateOf('修复  登录\n超时问题')).toBe('修复 登录 超时问题');
    expect(autoTitleCandidateOf('a'.repeat(60)).length).toBe(48);
  });

  test('空文本与纯空白：null（不命名）', () => {
    expect(autoTitleCandidateOf('')).toBeNull();
    expect(autoTitleCandidateOf('   \n  ')).toBeNull();
  });

  test('症状回归：行首斜杠命令不是标题语料——/compact 成功不得把会话改名为命令文本', () => {
    expect(autoTitleCandidateOf('/compact')).toBeNull();
    expect(autoTitleCandidateOf('/compact 保留迁移重点')).toBeNull();
    expect(autoTitleCandidateOf('/skill:writer 写一段')).toBeNull();
  });

  test('非行首斜杠是普通语料（命令在文中被讨论）', () => {
    expect(autoTitleCandidateOf('讨论一下 /compact 的行为')).toBe('讨论一下 /compact 的行为');
  });
});
