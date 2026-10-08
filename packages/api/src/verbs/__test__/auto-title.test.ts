import { describe, expect, test } from 'bun:test';

import { autoTitleCandidateOf } from '../auto-title';

describe('autoTitleCandidateOf：自动命名标题语料判定', () => {
  test('普通消息：空白折叠、截断 48 字符', () => {
    expect(autoTitleCandidateOf('修复  登录\n超时问题')).toBe('修复 登录 超时问题');
    expect(autoTitleCandidateOf('a'.repeat(60))?.length).toBe(48);
  });

  test('空文本与纯空白：null（不命名）', () => {
    expect(autoTitleCandidateOf('')).toBeNull();
    expect(autoTitleCandidateOf('   \n  ')).toBeNull();
  });

  test('症状回归：纯命令不是标题语料——/compact 成功不得把会话改名为命令文本', () => {
    expect(autoTitleCandidateOf('/compact')).toBeNull();
    expect(autoTitleCandidateOf('/compact 保留迁移重点')).toBe('保留迁移重点');
    expect(autoTitleCandidateOf('/skill:writer')).toBeNull();
  });

  test('症状回归：命令后随意图文本是语料——/skill 调用不得因命令前缀连坐丢弃用户意图', () => {
    expect(autoTitleCandidateOf('/skill:writer 写一段')).toBe('写一段');
    expect(autoTitleCandidateOf('/skill:unslop         这https://github.com/mattpocock/skills/ skill有什么作用')).toBe(
      '这https://github.com/mattpocock/skills/ skill有什么作用'.slice(0, 48),
    );
  });

  test('症状回归：绝对路径开头的提问是普通语料——不得误判为命令而停留默认标题', () => {
    expect(autoTitleCandidateOf('/Users/wrr/work/ZCode/packages/rpc 实现了什么')).toBe(
      '/Users/wrr/work/ZCode/packages/rpc 实现了什么'.slice(0, 48),
    );
  });

  test('非行首斜杠是普通语料（命令在文中被讨论）', () => {
    expect(autoTitleCandidateOf('讨论一下 /compact 的行为')).toBe('讨论一下 /compact 的行为');
  });
});
